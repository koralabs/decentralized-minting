import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import {
  Address,
  makeInlineTxOutputDatum,
  makeValue,
} from "@helios-lang/ledger";
import { makeTxBuilder, TxBuilder } from "@helios-lang/tx-utils";
import { Err, Ok, Result } from "ts-res";

import { fetchMintingData } from "../configs/index.js";
import {
  buildMintingData,
  buildMintingDataMintLegacyHandlesRedeemer,
  LegacyHandle,
  LegacyHandleProof,
  MintingData,
  parseMPTProofJSON,
} from "../contracts/index.js";
import { getBlockfrostV0Client, getNetwork } from "../helpers/index.js";
import { DeployedScripts, fetchAllDeployedScripts } from "./deploy.js";

/**
 * @interface
 * @typedef {object} PrepareLegacyMintParams
 * @property {Address} address Wallet Address to perform mint
 * @property {LegacyHandle[]} handles Legacy Handles to mint
 * @property {Trie} db Trie DB
 * @property {string} blockfrostApiKey Blockfrost API Key
 */
interface PrepareLegacyMintParams {
  address: Address;
  handles: LegacyHandle[];
  db: Trie;
  blockfrostApiKey: string;
}

/**
 * @description Mint Legacy Handles from Order
 * @param {PrepareLegacyMintParams} params
 * @returns {Promise<Result<TxBuilder,  Error>>} Transaction Result
 */
const prepareLegacyMintTransaction = async (
  params: PrepareLegacyMintParams
): Promise<
  Result<
    {
      txBuilder: TxBuilder;
      deployedScripts: DeployedScripts;
    },
    Error
  >
> => {
  const { address, handles, db, blockfrostApiKey } = params;
  const network = getNetwork(blockfrostApiKey);
  const isMainnet = network == "mainnet";
  if (address.era == "Byron")
    return Err(new Error("Byron Address not supported"));
  const blockfrostV0Client = getBlockfrostV0Client(blockfrostApiKey);

  // fetch deployed scripts
  const fetchedResult = await fetchAllDeployedScripts(blockfrostV0Client);
  if (!fetchedResult.ok)
    return Err(new Error(`Failed to fetch scripts: ${fetchedResult.error}`));
  const { mintingDataScriptTxInput } = fetchedResult.data;

  const mintingDataResult = await fetchMintingData();
  if (!mintingDataResult.ok)
    return Err(
      new Error(`Failed to fetch minting data: ${mintingDataResult.error}`)
    );
  const { mintingData, mintingDataAssetTxInput } = mintingDataResult.data;

  // check if current db trie hash is same as minting data root hash
  if (
    mintingData.mpt_root_hash.toLowerCase() !=
    (db.hash?.toString("hex") || Buffer.alloc(32).toString("hex")).toLowerCase()
  ) {
    return Err(new Error("ERROR: Local DB and On Chain Root Hash mismatch"));
  }

  // make Proofs for Minting Data V1 Redeemer
  const proofs: LegacyHandleProof[] = [];
  for (const handle of handles) {
    const { utf8Name, hexName, isVirtual } = handle;

    try {
      // NOTE:
      // Have to remove handles if transaction fails
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

  // update all handles in minting data
  const newMintingData: MintingData = {
    ...mintingData,
    mpt_root_hash: db.hash.toString("hex"),
  };

  // minting data asset value
  const mintingDataValue = makeValue(
    mintingDataAssetTxInput.value.lovelace,
    mintingDataAssetTxInput.value.assets
  );

  // NOTE:
  // we assume that koralab's minter index is 0
  // meaning we always use Koralab minter
  // build proofs redeemer for minting data v1
  const mintingDataMintLegacyHandlesRedeemer =
    buildMintingDataMintLegacyHandlesRedeemer(proofs);

  // start building tx
  const txBuilder = makeTxBuilder({
    isMainnet,
  });

  // <-- attach deploy scripts
  txBuilder.refer(mintingDataScriptTxInput);

  // <-- spend minting data utxo
  txBuilder.spendUnsafe(
    mintingDataAssetTxInput,
    mintingDataMintLegacyHandlesRedeemer
  );

  // <-- lock minting data value with new root hash
  txBuilder.payUnsafe(
    mintingDataAssetTxInput.address,
    mintingDataValue,
    makeInlineTxOutputDatum(buildMintingData(newMintingData))
  );

  // NOTE:
  // After call this function
  // using txBuilder (return value), they can continue with minting assets (e.g. ref and user asset)

  return Ok({
    txBuilder,
    deployedScripts: fetchedResult.data,
  });
};

export type { PrepareLegacyMintParams };
export { prepareLegacyMintTransaction };
