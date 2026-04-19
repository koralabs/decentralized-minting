import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import type { Cardano as CardanoTypes } from "@cardano-sdk/core";
import type { Ed25519KeyHashHex } from "@cardano-sdk/crypto";
import { Err, Ok, Result } from "ts-res";

import { fetchMintingData } from "../configs/index.js";
import {
  buildMintingData,
  buildMintingDataMintLegacyHandlesRedeemer,
  LegacyHandle,
  LegacyHandleProof,
  MintingData,
  parseMPTProofJSON,
  plutusDataToCbor,
} from "../contracts/index.js";
import { getBlockfrostBuildContext } from "../helpers/cardano-sdk/blockfrostContext.js";
import { Cardano, type HexBlob, Serialization } from "../helpers/cardano-sdk/index.js";
import { getNetwork } from "../helpers/index.js";
import { DeployedScripts, fetchAllDeployedScripts } from "./deploy.js";
import type { TxPlan } from "./txPlan.js";

interface PrepareLegacyMintParams {
  /** Change address (bech32) of the minter wallet. */
  changeAddress: string;
  /** Payment-key-hash of the minter (required signer). */
  minterKeyHash: string;
  /** Wallet UTxOs available for fees. */
  walletUtxos: CardanoTypes.Utxo[];
  /** Collateral UTxO (ADA-only, ≥5 ADA). */
  collateralUtxo?: CardanoTypes.Utxo;
  handles: LegacyHandle[];
  db: Trie;
  blockfrostApiKey: string;
}

interface PrepareLegacyMintDeps {
  fetchAllDeployedScriptsFn?: typeof fetchAllDeployedScripts;
  fetchMintingDataFn?: typeof fetchMintingData;
}

/**
 * Prepare the minting-data spend component of a legacy mint transaction.
 * Returns a partial `TxPlan` that captures the minting-data UTxO spend with
 * the MintLegacyHandles redeemer + the updated MPT root datum output. The
 * caller (`mintLegacyHandles`) adds the actual minted-handle outputs and
 * mints before calling `finalizeTxPlan`.
 */
const prepareLegacyMintTransaction = async (
  params: PrepareLegacyMintParams,
  {
    fetchAllDeployedScriptsFn = fetchAllDeployedScripts,
    fetchMintingDataFn = fetchMintingData,
  }: PrepareLegacyMintDeps = {},
): Promise<
  Result<
    {
      plan: TxPlan;
      deployedScripts: DeployedScripts;
    },
    Error
  >
> => {
  const {
    changeAddress,
    minterKeyHash,
    walletUtxos,
    collateralUtxo,
    handles,
    db,
    blockfrostApiKey,
  } = params;
  const network = getNetwork(blockfrostApiKey);

  const fetchedResult = await fetchAllDeployedScriptsFn();
  if (!fetchedResult.ok) {
    return Err(new Error(`Failed to fetch scripts: ${fetchedResult.error}`));
  }
  const { mintingDataScript } = fetchedResult.data;

  const mintingDataResult = await fetchMintingDataFn();
  if (!mintingDataResult.ok) {
    return Err(
      new Error(`Failed to fetch minting data: ${mintingDataResult.error}`),
    );
  }
  const { mintingData, mintingDataUtxo } = mintingDataResult.data;

  // Ensure local MPT matches on-chain root.
  if (
    mintingData.mpt_root_hash.toLowerCase() !==
    (db.hash?.toString("hex") || Buffer.alloc(32).toString("hex")).toLowerCase()
  ) {
    return Err(new Error("ERROR: Local DB and On Chain Root Hash mismatch"));
  }

  // Compute MPT proofs as we insert each handle.
  const proofs: LegacyHandleProof[] = [];
  for (const handle of handles) {
    const { utf8Name, hexName, isVirtual } = handle;
    try {
      await db.insert(utf8Name, "");
      const mpfProof = await db.prove(utf8Name);
      proofs.push({
        mpt_proof: parseMPTProofJSON(mpfProof.toJSON()),
        handle_name: hexName,
        is_virtual: isVirtual ? 1n : 0n,
      });
    } catch (e) {
      console.warn("Handle already exists", utf8Name, e);
      return Err(new Error(`Handle "${utf8Name}" already exists`));
    }
  }

  const newMintingData: MintingData = {
    ...mintingData,
    mpt_root_hash: db.hash.toString("hex"),
  };

  // Reconstruct the minting-data UTxO as a Core Utxo.
  const mintingDataCoreUtxo = reconstructUtxo(mintingDataUtxo);

  // Output: back to the same (minting-data) script address with updated datum.
  const updatedDatum = Serialization.PlutusData.fromCbor(
    plutusDataToCbor(buildMintingData(newMintingData)) as HexBlob,
  ).toCore();
  const mintingDataOutput: CardanoTypes.TxOut = {
    address: mintingDataCoreUtxo[1].address,
    value: mintingDataCoreUtxo[1].value,
    datum: updatedDatum,
  };

  // Spend redeemer (constructor 1 = MintLegacyHandles).
  const redeemerDataCbor = plutusDataToCbor(
    buildMintingDataMintLegacyHandlesRedeemer(proofs),
  );
  const spendRedeemer: CardanoTypes.Redeemer = {
    data: Serialization.PlutusData.fromCbor(redeemerDataCbor as HexBlob).toCore(),
    executionUnits: { memory: 0, steps: 0 },
    index: 0,
    purpose: Cardano.RedeemerPurpose.spend,
  };

  const buildContext = await getBlockfrostBuildContext(network, blockfrostApiKey);

  const referenceInputs = new Set<CardanoTypes.TxIn>([
    {
      txId: Cardano.TransactionId(
        mintingDataScript.refScriptUtxo.txHash as HexBlob,
      ),
      index: mintingDataScript.refScriptUtxo.outputIndex,
    },
  ]);

  const plan: TxPlan = {
    preSelectedUtxos: [mintingDataCoreUtxo],
    spareUtxos: walletUtxos,
    outputs: [mintingDataOutput],
    referenceInputs,
    redeemers: [spendRedeemer],
    requiredSigners: [minterKeyHash as Ed25519KeyHashHex],
    usedPlutusVersions: [Cardano.PlutusLanguageVersion.V2],
    collateralUtxo,
    changeAddress,
    buildContext,
  };

  return Ok({ plan, deployedScripts: fetchedResult.data });
};

const reconstructUtxo = (
  descriptor: import("../configs/index.js").UtxoDescriptor,
): CardanoTypes.Utxo => {
  const assets = new Map<CardanoTypes.AssetId, bigint>();
  for (const [key, quantity] of descriptor.assets) {
    const [policyId, assetName] = key.split(".");
    const assetId = Cardano.AssetId.fromParts(
      Cardano.PolicyId(policyId as HexBlob),
      Cardano.AssetName(assetName as HexBlob),
    );
    assets.set(assetId, quantity);
  }
  const txIn: CardanoTypes.HydratedTxIn = {
    txId: Cardano.TransactionId(descriptor.txHash as HexBlob),
    index: descriptor.outputIndex,
    address: descriptor.address as CardanoTypes.TxOut["address"],
  };
  const txOut: CardanoTypes.TxOut = {
    address: descriptor.address as CardanoTypes.TxOut["address"],
    value: {
      coins: descriptor.lovelace,
      ...(assets.size > 0 ? { assets } : {}),
    },
    ...(descriptor.inlineDatumCbor
      ? {
          datum: Serialization.PlutusData.fromCbor(
            descriptor.inlineDatumCbor as HexBlob,
          ).toCore(),
        }
      : {}),
  };
  return [txIn, txOut];
};

export type { PrepareLegacyMintParams };
export { prepareLegacyMintTransaction };
