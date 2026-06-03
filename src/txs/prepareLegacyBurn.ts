import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import type { Cardano as CardanoTypes } from "@cardano-sdk/core";
import type { Ed25519KeyHashHex } from "@cardano-sdk/crypto";
import { Err, Ok, Result } from "ts-res";

import { fetchMintingData } from "../configs/index.js";
import {
  buildMintingData,
  buildMintingDataBurnLegacyHandlesRedeemer,
  FreeVirtualData,
  LegacyHandle,
  LegacyHandleProof,
  MintingData,
  parseMPTProofJSON,
  plutusDataToCbor,
} from "../contracts/index.js";
import { encodeRegistryValue, valueBuffer } from "../store/labelSet.js";
import { getBlockfrostBuildContext } from "../helpers/cardano-sdk/blockfrostContext.js";
import { Cardano, type HexBlob, Serialization } from "../helpers/cardano-sdk/index.js";
import { getNetwork } from "../helpers/index.js";
import { DeployedScripts, fetchAllDeployedScripts } from "./deploy.js";
import { reconstructUtxo } from "./prepareLegacyMint.js";
import type { TxPlan } from "./txPlan.js";

interface PrepareLegacyBurnParams {
  /** Change address (bech32) of the minter wallet. */
  changeAddress: string;
  /** Payment-key-hash of the minter (required signer). */
  minterKeyHash: string;
  /** Wallet UTxOs available for fees. */
  walletUtxos: CardanoTypes.Utxo[];
  /** Collateral UTxO (ADA-only, ≥5 ADA). */
  collateralUtxo?: CardanoTypes.Utxo;
  /** Handles to burn (e.g. virtual sub handles); deleted from the MPT. */
  handles: LegacyHandle[];
  db: Trie;
  blockfrostApiKey: string;
}

interface PrepareLegacyBurnDeps {
  fetchAllDeployedScriptsFn?: typeof fetchAllDeployedScripts;
  fetchMintingDataFn?: typeof fetchMintingData;
}

/**
 * WS2 — prepare the minting-data spend component of a legacy *burn* transaction.
 *
 * The mirror of `prepareLegacyMintTransaction`: for each handle we generate an MPT *inclusion*
 * proof (against the current root, which still contains the key) and then delete the key from
 * the local trie, advancing the root. The `BurnLegacyHandles` redeemer carries those proofs;
 * on-chain `process_legacy_handles(amount = -1)` applies `mpt.delete` and requires the tx to
 * burn exactly the corresponding assets. This keeps the MPT root in sync when a legacy
 * (virtual) sub-handle is burned, instead of the DB-only delete that silently drifts the root.
 *
 * The caller adds the actual asset burns (negative mint under the legacy native policy) before
 * `finalizeTxPlan`.
 */
const prepareLegacyBurnTransaction = async (
  params: PrepareLegacyBurnParams,
  {
    fetchAllDeployedScriptsFn = fetchAllDeployedScripts,
    fetchMintingDataFn = fetchMintingData,
  }: PrepareLegacyBurnDeps = {},
): Promise<
  Result<{ plan: TxPlan; deployedScripts: DeployedScripts }, Error>
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

  // Inclusion proof per handle (against the current root), then delete to advance the root.
  const proofs: LegacyHandleProof[] = [];
  for (const handle of handles) {
    const { utf8Name, hexName, isVirtual, privateVirtual } = handle;
    try {
      const mpfProof = await db.prove(utf8Name);
      await db.delete(utf8Name);

      // WS5 free-virtual — a PRIVATE virtual burn refunds a counter slot (decrement the root
      // counter). Root proof taken AFTER the sub delete (the contract bumps on the post-delete
      // trie), for the root's current value encode(preCount, labels).
      let free_virtual: FreeVirtualData | undefined;
      if (privateVirtual) {
        const { rootUtf8Name, preCount, rootLabels } = privateVirtual;
        const rootProof = await db.prove(rootUtf8Name);
        await db.delete(rootUtf8Name);
        await db.insert(
          rootUtf8Name,
          valueBuffer(encodeRegistryValue(preCount - 1n, rootLabels)),
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
      console.warn("Handle not found in trie", utf8Name, e);
      return Err(new Error(`Handle "${utf8Name}" not found in trie`));
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

  // Spend redeemer (constructor 3 = BurnLegacyHandles).
  const redeemerDataCbor = plutusDataToCbor(
    buildMintingDataBurnLegacyHandlesRedeemer(proofs),
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

export type { PrepareLegacyBurnParams };
export { prepareLegacyBurnTransaction };
