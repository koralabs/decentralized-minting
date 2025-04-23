import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import {
  Address,
  makeInlineTxOutputDatum,
  makePubKeyHash,
  makeStakingAddress,
  makeStakingValidatorHash,
  makeValue,
} from "@helios-lang/ledger";
import { makeTxBuilder, TxBuilder } from "@helios-lang/tx-utils";
import { HANDLE_PRICE_INFO_HANDLE_NAME } from "constants/index.js";
import { Err, Ok, Result } from "ts-res";

import {
  fetchHandlePriceInfoData,
  fetchMintingData,
  fetchSettings,
} from "../configs/index.js";
import {
  buildMintingData,
  buildMintingDataMintHandlesRedeemer,
  buildMintV1MintHandlesRedeemer,
  Handle,
  HandlePriceInfo,
  makeVoidData,
  MintingData,
  parseMPTProofJSON,
  Proof,
  Settings,
  SettingsV1,
} from "../contracts/index.js";
import { getBlockfrostV0Client, getNetwork } from "../helpers/index.js";
import { calculateTreasuryFeeAndMinterFee } from "../utils/index.js";
import { DeployedScripts, fetchAllDeployedScripts } from "./deploy.js";

/**
 * @interface
 * @typedef {object} PrepareNewMintParams
 * @property {Address} address Wallet Address to perform mint
 * @property {Handle[]} handles New Handles to mint
 * @property {Trie} db Trie DB
 * @property {string} blockfrostApiKey Blockfrost API Key
 */
interface PrepareNewMintParams {
  address: Address;
  handles: Handle[];
  db: Trie;
  blockfrostApiKey: string;
}

/**
 * @description Mint Handles from Order
 * @param {PrepareNewMintParams} params
 * @returns {Promise<Result<TxBuilder,  Error>>} Transaction Result
 */
const prepareNewMintTransaction = async (
  params: PrepareNewMintParams
): Promise<
  Result<
    {
      txBuilder: TxBuilder;
      deployedScripts: DeployedScripts;
      settings: Settings;
      settingsV1: SettingsV1;
      handlePriceInfo: HandlePriceInfo;
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
  const {
    mintProxyScriptTxInput,
    mintingDataScriptTxInput,
    mintV1ScriptDetails,
    mintV1ScriptTxInput,
    ordersScriptTxInput,
  } = fetchedResult.data;

  // fetch settings
  const settingsResult = await fetchSettings(network);
  if (!settingsResult.ok)
    return Err(new Error(`Failed to fetch settings: ${settingsResult.error}`));
  const { settings, settingsV1, settingsAssetTxInput } = settingsResult.data;
  const { allowed_minters, treasury_address, treasury_fee_percentage } =
    settingsV1;

  const mintingDataResult = await fetchMintingData();
  if (!mintingDataResult.ok)
    return Err(
      new Error(`Failed to fetch minting data: ${mintingDataResult.error}`)
    );
  const { mintingData, mintingDataAssetTxInput } = mintingDataResult.data;

  // NOTE:
  // we assume valid handle price asset is
  // "price@handle_settings" (koralab's)
  const handlePriceInfoDataResult = await fetchHandlePriceInfoData(
    HANDLE_PRICE_INFO_HANDLE_NAME
  );
  if (!handlePriceInfoDataResult.ok) {
    return Err(
      new Error(
        `Failed to fetch handle price info: ${handlePriceInfoDataResult.error}`
      )
    );
  }
  const { handlePriceInfo, handlePriceInfoAssetTxInput } =
    handlePriceInfoDataResult.data;

  // check if current db trie hash is same as minting data root hash
  if (
    mintingData.mpt_root_hash.toLowerCase() !=
    (db.hash?.toString("hex") || Buffer.alloc(32).toString("hex")).toLowerCase()
  ) {
    return Err(new Error("ERROR: Local DB and On Chain Root Hash mismatch"));
  }

  // calculate total handle price
  const totalHandlePrice = handles.reduce((acc, cur) => acc + cur.price, 0n);
  const { treasuryFee, minterFee } = calculateTreasuryFeeAndMinterFee(
    totalHandlePrice,
    treasury_fee_percentage
  );

  // make Proofs for Minting Data V1 Redeemer
  const proofs: Proof[] = [];
  for (const handle of handles) {
    const { utf8Name } = handle;

    try {
      // NOTE:
      // Have to remove handles if transaction fails
      await db.insert(utf8Name, "");
      const mpfProof = await db.prove(utf8Name);
      proofs.push({
        mpt_proof: parseMPTProofJSON(mpfProof.toJSON()),
        // NOTE:
        // for now root handle settings index is -1
        // because we don't support sub handle minting yet
        root_handle_settings_index: -1n,
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

  // build redeemer for mint v1
  const mintV1MintHandlesRedeemer = buildMintV1MintHandlesRedeemer();

  // NOTE:
  // we assume that koralab's minter index is 0
  // meaning we always use Koralab minter
  // build proofs redeemer for minting data v1
  const mintingDataMintHandlesRedeemer = buildMintingDataMintHandlesRedeemer(
    proofs,
    0n
  );

  // start building tx
  const txBuilder = makeTxBuilder({
    isMainnet,
  });

  // <-- add required signer
  txBuilder.addSigners(makePubKeyHash(allowed_minters[0]));

  // <-- attach settings asset as reference input
  txBuilder.refer(settingsAssetTxInput);

  // <-- attach handle price info asset as reference input
  txBuilder.refer(handlePriceInfoAssetTxInput);

  // <-- attach deploy scripts
  txBuilder.refer(
    mintProxyScriptTxInput,
    mintV1ScriptTxInput,
    mintingDataScriptTxInput,
    ordersScriptTxInput
  );

  // <-- spend minting data utxo
  txBuilder.spendUnsafe(
    mintingDataAssetTxInput,
    mintingDataMintHandlesRedeemer
  );

  // <-- lock minting data value with new root hash
  txBuilder.payUnsafe(
    mintingDataAssetTxInput.address,
    mintingDataValue,
    makeInlineTxOutputDatum(buildMintingData(newMintingData))
  );

  // <-- withdraw from mint v1 withdraw validator (script from reference input)
  txBuilder.withdrawUnsafe(
    makeStakingAddress(
      isMainnet,
      makeStakingValidatorHash(mintV1ScriptDetails.validatorHash)
    ),
    0n,
    mintV1MintHandlesRedeemer
  );

  // <-- pay treasury fee
  txBuilder.payUnsafe(
    treasury_address,
    makeValue(treasuryFee),
    makeInlineTxOutputDatum(makeVoidData())
  );

  // <-- pay minter fee
  txBuilder.payUnsafe(
    address,
    makeValue(minterFee),
    makeInlineTxOutputDatum(makeVoidData())
  );

  // NOTE:
  // After call this function
  // using txBuilder (return value), they can continue with minting assets (e.g. ref and user asset)

  return Ok({
    txBuilder,
    deployedScripts: fetchedResult.data,
    settings,
    settingsV1,
    handlePriceInfo,
  });
};

export type { PrepareNewMintParams };
export { prepareNewMintTransaction };
