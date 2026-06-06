import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import type { Cardano as CardanoTypes } from "@cardano-sdk/core";
import type { Ed25519KeyHashHex } from "@cardano-sdk/crypto";
import { Err, Ok, Result } from "ts-res";

import { fetchMintingData, fetchSettings } from "../configs/index.js";
import {
  buildMintingData,
  buildMintingDataMintLabelAssetsRedeemer,
  LabelAssetProof,
  MintingData,
  parseMPTProofJSON,
  plutusDataToCbor,
} from "../contracts/index.js";
import { getBlockfrostBuildContext } from "../helpers/cardano-sdk/blockfrostContext.js";
import { Cardano, type HexBlob, Serialization } from "../helpers/cardano-sdk/index.js";
import { getNetwork } from "../helpers/index.js";
import { apply as applyLabelSet, valueBuffer } from "../store/labelSet.js";
import { encode as encodeRegistryValue } from "../store/registryValue.js";
import { DeployedScripts, fetchAllDeployedScripts } from "./deploy.js";
import { reconstructUtxo } from "./prepareLegacyMint.js";
import type { TxPlan } from "./txPlan.js";

/** One label asset (e.g. 001 settings) to mint (+1) or burn (-1) for a root handle. */
interface LabelAssetRequest {
  /** Root handle name (UTF-8) — the MPT key. */
  utf8Name: string;
  /** Root handle name (hex) — the MPT key encoded for the proof. */
  hexName: string;
  /** 4-byte CIP-67 label prefix (hex), e.g. "00001070" for 001. */
  label: string;
  /** +1 to add the label (mint the asset) / -1 to remove it (burn). */
  amount: bigint;
  /** The key's current label set (hex; "" if none yet). */
  oldLabels: string;
  /** The key's current free-virtual name set (hex names; [] unless the root holds free virtuals). */
  oldFreeNames?: string[];
  /** The root's 222 owner-NFT UTxO to reference (proves ownership + fixes the policy). */
  ownerRefInput: { txHash: string; outputIndex: number };
}

interface PrepareLabelAssetsParams {
  changeAddress: string;
  /** Minter key hash — must be the `allowed_minter` at `minterIndex` in settings. */
  minterKeyHash: string;
  minterIndex: bigint;
  walletUtxos: CardanoTypes.Utxo[];
  collateralUtxo?: CardanoTypes.Utxo;
  requests: LabelAssetRequest[];
  db: Trie;
  blockfrostApiKey: string;
}

interface PrepareLabelAssetsDeps {
  fetchAllDeployedScriptsFn?: typeof fetchAllDeployedScripts;
  fetchMintingDataFn?: typeof fetchMintingData;
  fetchSettingsFn?: typeof fetchSettings;
}

/**
 * WS1 — prepare the minting-data spend of a label-asset mint/burn transaction.
 *
 * DeMi becomes the minter of the per-handle label assets (001 settings, future 002, …). For
 * each request we update the handle key's MPT value (its canonical label set) via a single
 * `mpt.update` proof — add the label (+1) or remove it (−1) — and the `MintLabelAssets`
 * redeemer requires the tx to mint exactly the matching ±1 of `(policy, label ‖ handle_name)`.
 * Authorization is the `allowed_minter` signature plus the root's 222 owner NFT referenced as
 * an input (which also fixes the label asset's policy on-chain). The caller adds the actual
 * label-asset mint/burn entries + their outputs/datums before `finalizeTxPlan`.
 */
const prepareLabelAssetsTransaction = async (
  params: PrepareLabelAssetsParams,
  {
    fetchAllDeployedScriptsFn = fetchAllDeployedScripts,
    fetchMintingDataFn = fetchMintingData,
    fetchSettingsFn = fetchSettings,
  }: PrepareLabelAssetsDeps = {},
): Promise<
  Result<{ plan: TxPlan; deployedScripts: DeployedScripts }, Error>
> => {
  const {
    changeAddress,
    minterKeyHash,
    minterIndex,
    walletUtxos,
    collateralUtxo,
    requests,
    db,
    blockfrostApiKey,
  } = params;
  const network = getNetwork(blockfrostApiKey);

  if (requests.length === 0) {
    return Err(new Error("No label-asset requests provided"));
  }

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

  const settingsResult = await fetchSettingsFn(network);
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

  // For each request: prove the key at its current (old) value, then update the trie to the
  // new value (delete + re-insert) so the local root advances. The single proof is valid for
  // both old and new — `mpt.update` re-uses it (the key's neighbours don't change).
  const proofs: LabelAssetProof[] = [];
  for (const request of requests) {
    const { utf8Name, hexName, label, amount, oldLabels } = request;
    const oldFreeNames = request.oldFreeNames ?? [];
    let newLabels: string;
    try {
      newLabels = applyLabelSet(oldLabels, label, amount);
    } catch (e) {
      return Err(
        new Error(
          `Invalid label delta for "${utf8Name}" (${label}, ${amount}): ${(e as Error).message}`,
        ),
      );
    }
    // the stored value is encode(free_names, labels); a label change preserves the free-name set
    const newValue = encodeRegistryValue(oldFreeNames, newLabels);
    try {
      const mpfProof = await db.prove(utf8Name);
      proofs.push({
        mpt_proof: parseMPTProofJSON(mpfProof.toJSON()),
        handle_name: hexName,
        label,
        old_free_names: oldFreeNames,
        old_labels: oldLabels,
        amount,
      });
      // advance the local trie: replace old value with new value at the same key
      await db.delete(utf8Name);
      await db.insert(utf8Name, valueBuffer(newValue));
    } catch (e) {
      return Err(
        new Error(`Failed to update MPT for "${utf8Name}": ${(e as Error).message}`),
      );
    }
  }

  const newMintingData: MintingData = {
    ...mintingData,
    mpt_root_hash: db.hash.toString("hex"),
  };

  const mintingDataCoreUtxo = reconstructUtxo(mintingDataUtxo);

  const updatedDatum = Serialization.PlutusData.fromCbor(
    plutusDataToCbor(buildMintingData(newMintingData)) as HexBlob,
  ).toCore();
  const mintingDataOutput: CardanoTypes.TxOut = {
    address: mintingDataCoreUtxo[1].address,
    value: mintingDataCoreUtxo[1].value,
    datum: updatedDatum,
  };

  // Spend redeemer (constructor 4 = MintLabelAssets).
  const redeemerDataCbor = plutusDataToCbor(
    buildMintingDataMintLabelAssetsRedeemer(proofs, minterIndex),
  );
  const spendRedeemer: CardanoTypes.Redeemer = {
    data: Serialization.PlutusData.fromCbor(redeemerDataCbor as HexBlob).toCore(),
    executionUnits: { memory: 0, steps: 0 },
    index: 0,
    purpose: Cardano.RedeemerPurpose.spend,
  };

  const buildContext = await getBlockfrostBuildContext(network, blockfrostApiKey);

  // Reference inputs: settings (for allowed_minter + new policy), the minting-data ref script,
  // and each distinct 222 owner NFT UTxO (the on-chain ownership proof).
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
  const seenOwnerRefs = new Set<string>();
  for (const { ownerRefInput } of requests) {
    const key = `${ownerRefInput.txHash}#${ownerRefInput.outputIndex}`;
    if (seenOwnerRefs.has(key)) continue;
    seenOwnerRefs.add(key);
    referenceInputs.add({
      txId: Cardano.TransactionId(ownerRefInput.txHash as HexBlob),
      index: ownerRefInput.outputIndex,
    });
  }

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

export type { LabelAssetRequest, PrepareLabelAssetsParams };
export { prepareLabelAssetsTransaction };
