import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import type { Cardano as CardanoTypes } from "@cardano-sdk/core";
import type { Ed25519KeyHashHex } from "@cardano-sdk/crypto";
import { Err, Ok, Result } from "ts-res";

import { fetchMintingData, fetchSettings } from "../configs/index.js";
import {
  buildMintingData,
  buildMintingDataMintLegacyHandlesRedeemer,
  FreeVirtualData,
  LegacyHandle,
  LegacyHandleProof,
  MintingData,
  parseMPTProofJSON,
  plutusDataToCbor,
} from "../contracts/index.js";
import { getBlockfrostBuildContext } from "../helpers/cardano-sdk/blockfrostContext.js";
import { Cardano, type HexBlob, Serialization } from "../helpers/cardano-sdk/index.js";
import { getNetwork } from "../helpers/index.js";
import { encodeRegistryValue, valueBuffer } from "../store/labelSet.js";
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
  /**
   * For subhandle mints: each root's 001 OwnerSettings reference input (the validator's
   * `find_root_handle_settings` reads the owner's tier pricing + payment_address) plus the
   * additive fee outputs the contract now enforces — owner royalty → owner's payment_address,
   * flat minter fee → an allowed minter, flat treasury fee → treasury_address. The caller
   * computes these from the batch's subhandles (each skipped when its amount is 0); the package
   * stays fee-agnostic and simply appends them. Root mints need neither. The settings reference
   * input (for `find_settings`) is attached automatically for every legacy mint.
   */
  subHandleReferenceInputs?: { txHash: string; outputIndex: number }[];
  feeOutputs?: CardanoTypes.TxOut[];
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

  // WS4 — settings reference input (the mint path now reads find_settings for the treasury
  // address + percentage when enforcing subhandle fees).
  const settingsResult = await fetchSettings(network);
  if (!settingsResult.ok) {
    return Err(new Error(`Failed to fetch settings: ${settingsResult.error}`));
  }
  const { settingsUtxo } = settingsResult.data;

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
    const { utf8Name, hexName, isVirtual, privateVirtual } = handle;
    try {
      await db.insert(utf8Name, "");
      const mpfProof = await db.prove(utf8Name);

      // WS5 free-virtual — for a PRIVATE virtual sub, also bump the ROOT key's counter. The
      // root proof is taken AFTER the sub insert (the contract bumps the counter on the
      // post-insert trie), for the root's CURRENT value encode(preCount, labels).
      let free_virtual: FreeVirtualData | undefined;
      if (privateVirtual) {
        const { rootUtf8Name, preCount, rootLabels } = privateVirtual;
        const rootProof = await db.prove(rootUtf8Name);
        await db.delete(rootUtf8Name);
        await db.insert(
          rootUtf8Name,
          valueBuffer(encodeRegistryValue(preCount + 1n, rootLabels)),
        );
        free_virtual = {
          root_proof: parseMPTProofJSON(rootProof.toJSON()),
          root_pre_count: preCount,
          root_labels: rootLabels,
        };
      }

      proofs.push({
        mpt_proof: parseMPTProofJSON(mpfProof.toJSON()),
        handle_name: hexName,
        is_virtual: isVirtual ? 1n : 0n,
        free_virtual,
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
    // WS4 — settings ref input (find_settings on the mint path)
    {
      txId: Cardano.TransactionId(settingsUtxo.txHash as HexBlob),
      index: settingsUtxo.outputIndex,
    },
  ]);

  // WS4 — each subhandle's root OwnerSettings reference input
  for (const ref of params.subHandleReferenceInputs ?? []) {
    referenceInputs.add({
      txId: Cardano.TransactionId(ref.txHash as HexBlob),
      index: ref.outputIndex,
    });
  }

  // The additive subhandle fee outputs (owner royalty + minter + treasury), computed by the
  // caller and omitted for root-only batches.
  const outputs: CardanoTypes.TxOut[] = [
    mintingDataOutput,
    ...(params.feeOutputs ?? []),
  ];

  const plan: TxPlan = {
    preSelectedUtxos: [mintingDataCoreUtxo],
    spareUtxos: walletUtxos,
    outputs,
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
export { prepareLegacyMintTransaction, reconstructUtxo };
