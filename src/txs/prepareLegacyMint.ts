import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import {
  Address,
  AssetClass,
  makeAddress,
  makeAssets,
  makeInlineTxOutputDatum,
  makePubKeyHash,
  makeStakingAddress,
  makeStakingValidatorHash,
  makeValidatorHash,
  makeValue,
  TxOutputId,
} from "@helios-lang/ledger";
import { makeTxBuilder, TxBuilder } from "@helios-lang/tx-utils";
import { Err, Ok, Result } from "ts-res";

import { fetchMintingData, fetchSettings } from "../configs/index.js";
import {
  buildMintingData,
  buildMintingDataV1MintOrBurnRedeemer,
  makeVoidData,
  parseMPTProofJSON,
  Proof,
  Settings,
  SettingsV1,
} from "../contracts/index.js";
import { getBlockfrostV0Client, getNetwork } from "../helpers/index.js";
import { DeployedScripts, fetchAllDeployedScripts } from "./deploy.js";

/**
 * @interface
 * @typedef {object} PrepareLegacyMintParams
 * @property {Address} address Wallet Address to perform mint
 * @property {string[]} handles New Handles name to mint
 * @property {Trie} db Trie DB
 * @property {AssetClass} settingsAssetClass De Mi Contract's Settings Asset Class
 * @property {TxOutputId} settingsAssetTxOutputId De Mi Contract's Settings Asset Tx Output ID
 * @property {AssetClass} mintingDataAssetClass De Mi Contract's Minting Data Asset Class
 * @property {string} blockfrostApiKey Blockfrost API Key
 */
interface PrepareLegacyMintParams {
  address: Address;
  handles: string[];
  db: Trie;
  settingsAssetClass: AssetClass;
  settingsAssetTxOutputId: TxOutputId;
  mintingDataAssetClass: AssetClass;
  blockfrostApiKey: string;
}

/**
 * @description Mint Handles from Order
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
      settings: Settings;
      settingsV1: SettingsV1;
    },
    Error
  >
> => {
  const {
    address,
    handles,
    db,
    settingsAssetClass,
    settingsAssetTxOutputId,
    mintingDataAssetClass,
    blockfrostApiKey,
  } = params;
  const network = getNetwork(blockfrostApiKey);
  const isMainnet = network == "mainnet";
  if (address.era == "Byron")
    return Err(new Error("Byron Address not supported"));
  const blockfrostV0Client = getBlockfrostV0Client(blockfrostApiKey);

  // fetch deployed scripts
  const fetchedResult = await fetchAllDeployedScripts(
    network,
    blockfrostV0Client
  );
  if (!fetchedResult.ok)
    return Err(new Error(`Faied to fetch scripts: ${fetchedResult.error}`));
  const {
    mintingDataProxyScriptDetails,
    mintingDataProxyScriptTxInput,
    mintingDataV1ScriptDetails,
    mintingDataV1ScriptTxInput,
  } = fetchedResult.data;

  // fetch settings
  const settingsResult = await fetchSettings(
    settingsAssetClass,
    settingsAssetTxOutputId,
    blockfrostApiKey
  );
  if (!settingsResult.ok)
    return Err(new Error(`Failed to fetch settings: ${settingsResult.error}`));
  const { settings, settingsV1, settingsAssetTxInput } = settingsResult.data;
  const { allowed_minters } = settingsV1;

  // fetch minting data
  const mintingDataProxyAddress = makeAddress(
    isMainnet,
    makeValidatorHash(mintingDataProxyScriptDetails.validatorHash)
  );
  const mintingDataResult = await fetchMintingData(
    mintingDataAssetClass,
    mintingDataProxyAddress,
    blockfrostApiKey
  );
  if (!mintingDataResult.ok)
    return Err(
      new Error(`Failed to fetch minting data: ${mintingDataResult.error}`)
    );
  const { mintingData, mintingDataTxInput } = mintingDataResult.data;

  // check if current db trie hash is same as minting data root hash
  if (
    mintingData.mpt_root_hash.toLowerCase() !=
    db.hash.toString("hex").toLowerCase()
  ) {
    return Err(new Error("ERROR: Local DB and On Chain Root Hash mismatch"));
  }

  // make Proofs for Minting Data V1 Redeemer
  const proofs: Proof[] = [];
  for (const handleName of handles) {
    try {
      // NOTE:
      // Have to remove handles if transaction fails
      await db.insert(handleName, "LEGACY");
      const mpfProof = await db.prove(handleName);
      proofs.push({
        mpt_proof: parseMPTProofJSON(mpfProof.toJSON()),
        handle: {
          handle_name: Buffer.from(handleName).toString("hex"),
          type: "legacy",
        },
        amount: 1n,
      });
    } catch (e) {
      console.warn("Handle already exists", handleName, e);
      return Err(new Error(`Handle "${handleName}" already exists`));
    }
  }

  // update all handles in minting data
  mintingData.mpt_root_hash = db.hash.toString("hex");

  // minting data asset value
  const mintingDataValue = makeValue(
    mintingDataTxInput.value.lovelace,
    makeAssets([[mintingDataAssetClass, 1n]])
  );

  // build proofs redeemer for minting data v1
  const mintingDataV1MintOrBurnRedeemer =
    buildMintingDataV1MintOrBurnRedeemer(proofs);

  // start building tx
  const txBuilder = makeTxBuilder({
    isMainnet,
  });

  // <-- add required signer
  txBuilder.addSigners(makePubKeyHash(allowed_minters[0]));

  // <-- attach settings asset as reference input
  txBuilder.refer(settingsAssetTxInput);

  // <-- attach deploy scripts
  txBuilder.refer(mintingDataProxyScriptTxInput, mintingDataV1ScriptTxInput);

  // <-- spend minting data utxo
  txBuilder.spendUnsafe(mintingDataTxInput, makeVoidData());

  // <-- lock minting data value with new root hash
  txBuilder.payUnsafe(
    mintingDataTxInput.address,
    mintingDataValue,
    makeInlineTxOutputDatum(buildMintingData(mintingData))
  );

  // <-- withdraw from minting data v1 withdraw validator (script from reference input)
  txBuilder.withdrawUnsafe(
    makeStakingAddress(
      isMainnet,
      makeStakingValidatorHash(mintingDataV1ScriptDetails.validatorHash)
    ),
    0n,
    mintingDataV1MintOrBurnRedeemer
  );

  // NOTE:
  // After call this function
  // using txBuilder (return value), they can continue with minting assets (e.g. ref and user asset)

  return Ok({
    txBuilder,
    deployedScripts: fetchedResult.data,
    settings,
    settingsV1,
  });
};

export type { PrepareLegacyMintParams };
export { prepareLegacyMintTransaction };
