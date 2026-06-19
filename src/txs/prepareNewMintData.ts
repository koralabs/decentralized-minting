import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import type { Cardano as CardanoTypes } from "@cardano-sdk/core";
import type { Ed25519KeyHashHex } from "@cardano-sdk/crypto";
import { Err, Ok, Result } from "ts-res";

import { fetchMintingData, fetchSettings } from "../configs/index.js";
import {
  buildMintingData,
  buildMintingDataMintDeMiHandlesRedeemer,
  MintingData,
  NewHandle,
  plutusDataToCbor,
  type SettingsV1,
} from "../contracts/index.js";
import { getBlockfrostBuildContext } from "../helpers/cardano-sdk/blockfrostContext.js";
import { Cardano, type HexBlob, Serialization } from "../helpers/cardano-sdk/index.js";
import { getNetwork } from "../helpers/index.js";
import { DeployedScripts, fetchAllDeployedScripts } from "./deploy.js";
import { buildOrderProofs } from "./orderProofs.js";
import { reconstructUtxo } from "./prepareLegacyMint.js";
import type { TxPlan } from "./txPlan.js";

interface PrepareNewMintDataParams {
  changeAddress: string;
  /** Payment-key-hash of the minter (required signer). */
  minterKeyHash: string;
  /** Index into `settings.allowed_minters` for the MintDeMiHandles redeemer. */
  minterIndex?: bigint;
  handles: NewHandle[];
  collateralUtxo?: CardanoTypes.Utxo;
  db: Trie;
  blockfrostApiKey: string;
}

interface PrepareNewMintDataDeps {
  fetchAllDeployedScriptsFn?: typeof fetchAllDeployedScripts;
  fetchMintingDataFn?: typeof fetchMintingData;
  fetchSettingsFn?: typeof fetchSettings;
}

/**
 * The minimal orders-path `MintDeMiHandles` minting-data spend, for callers (the engine) that build
 * their OWN token outputs (with rich CIP-68 datums), additive fee outputs, mint map (under the DeMi
 * mint-proxy policy), order spends, and finalize with auxiliary data. This is the orders-path analog
 * of `prepareLegacyMintTransaction`'s minimal plan, but with the `MintDeMiHandles(OrderProof[])`
 * redeemer + the MPT-root update from `buildOrderProofs` (sub-key inserts + free-virtual root bumps).
 *
 * Returns ONLY: the minting-data input preselected + its updated datum output, the MintDeMiHandles
 * spend redeemer, the settings + minting-data reference inputs, the minter required-signer, and the
 * deployed scripts (so the caller can wire the mint-proxy / orders / mint_v1 refs + redeemers). It
 * intentionally does NOT add handle-price-info / treasury / minter / token outputs — those are
 * root-mint or engine concerns.
 */
export const prepareNewMintDataSpend = async (
  params: PrepareNewMintDataParams,
  {
    fetchAllDeployedScriptsFn = fetchAllDeployedScripts,
    fetchMintingDataFn = fetchMintingData,
    fetchSettingsFn = fetchSettings,
  }: PrepareNewMintDataDeps = {},
): Promise<
  Result<
    {
      plan: TxPlan;
      deployedScripts: DeployedScripts;
      settingsV1: SettingsV1;
      newMintingData: MintingData;
    },
    Error
  >
> => {
  const {
    changeAddress,
    minterKeyHash,
    minterIndex = 0n,
    handles,
    collateralUtxo,
    db,
    blockfrostApiKey,
  } = params;
  const network = getNetwork(blockfrostApiKey);

  const fetchedResult = await fetchAllDeployedScriptsFn();
  if (!fetchedResult.ok) {
    return Err(new Error(`Failed to fetch scripts: ${fetchedResult.error}`));
  }
  const { mintingDataScript } = fetchedResult.data;

  const settingsResult = await fetchSettingsFn(network);
  if (!settingsResult.ok) {
    return Err(new Error(`Failed to fetch settings: ${settingsResult.error}`));
  }
  const { settingsV1, settingsUtxo } = settingsResult.data;

  const mintingDataResult = await fetchMintingDataFn();
  if (!mintingDataResult.ok) {
    return Err(new Error(`Failed to fetch minting data: ${mintingDataResult.error}`));
  }
  const { mintingData, mintingDataUtxo } = mintingDataResult.data;

  // Ensure local MPT matches on-chain root before mutating it.
  if (
    mintingData.mpt_root_hash.toLowerCase() !==
    (db.hash?.toString("hex") || Buffer.alloc(32).toString("hex")).toLowerCase()
  ) {
    return Err(new Error("ERROR: Local DB and On Chain Root Hash mismatch"));
  }

  // Build the per-order OrderProofs (sub key insert + free-virtual root bump), advancing the trie.
  let proofs;
  try {
    proofs = await buildOrderProofs(db, handles);
  } catch (e) {
    return Err(new Error(`Failed to build order proofs: ${(e as Error).message}`));
  }

  const newMintingData: MintingData = {
    ...mintingData,
    mpt_root_hash: db.hash.toString("hex"),
  };

  const mintingDataCoreUtxo = reconstructUtxo(mintingDataUtxo);
  const updatedMintingDatum = Serialization.PlutusData.fromCbor(
    plutusDataToCbor(buildMintingData(newMintingData)) as HexBlob,
  ).toCore();
  const mintingDataOutput: CardanoTypes.TxOut = {
    address: mintingDataCoreUtxo[1].address,
    value: mintingDataCoreUtxo[1].value,
    datum: updatedMintingDatum,
  };

  // Spend redeemer (constructor 0 = MintDeMiHandles) over the OrderProofs.
  const spendMintingDataRedeemer: CardanoTypes.Redeemer = {
    data: Serialization.PlutusData.fromCbor(
      plutusDataToCbor(
        buildMintingDataMintDeMiHandlesRedeemer(proofs, minterIndex),
      ) as HexBlob,
    ).toCore(),
    executionUnits: { memory: 0, steps: 0 },
    index: 0,
    purpose: Cardano.RedeemerPurpose.spend,
  };

  const buildContext = await getBlockfrostBuildContext(network, blockfrostApiKey);

  const referenceInputs = new Set<CardanoTypes.TxIn>([
    {
      txId: Cardano.TransactionId(settingsUtxo.txHash as HexBlob),
      index: settingsUtxo.outputIndex,
    },
    {
      txId: Cardano.TransactionId(
        mintingDataScript.refScriptUtxo.txHash as HexBlob,
      ),
      index: mintingDataScript.refScriptUtxo.outputIndex,
    },
  ]);

  const plan: TxPlan = {
    preSelectedUtxos: [mintingDataCoreUtxo],
    spareUtxos: [],
    outputs: [mintingDataOutput],
    referenceInputs,
    redeemers: [spendMintingDataRedeemer],
    requiredSigners: [minterKeyHash as Ed25519KeyHashHex],
    // demimntmpt minting-data spend is Plutus V3 (aiken v1.1.22).
    usedPlutusVersions: [Cardano.PlutusLanguageVersion.V3],
    collateralUtxo,
    changeAddress,
    buildContext,
  };

  return Ok({ plan, deployedScripts: fetchedResult.data, settingsV1, newMintingData });
};
