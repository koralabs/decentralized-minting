import { Store, Trie } from "@aiken-lang/merkle-patricia-forestry";
import {
  Address,
  AssetClass,
  makeAssets,
  makeInlineTxOutputDatum,
  makePubKeyHash,
  makeStakingAddress,
  makeStakingValidatorHash,
  makeTxOutputId,
  makeValue,
  TxInput,
  TxOutputId,
} from "@helios-lang/ledger";
import {
  BlockfrostV0Client,
  makeTxBuilder,
  NetworkName,
  TxBuilder,
} from "@helios-lang/tx-utils";
import { decodeUplcProgramV2FromCbor, UplcProgramV2 } from "@helios-lang/uplc";
import { ScriptDetails } from "@koralabs/kora-labs-common";
import { Err, Ok, Result } from "ts-res";

import { fetchMintingData, fetchSettings } from "../configs/index.js";
import {
  buildMintingData,
  buildMintingDataV1MintOrBurnRedeemer,
  buildMintV1MintHandlesRedeemer,
  makeVoidData,
  parseMPTProofJSON,
  Proof,
  Settings,
  SettingsV1,
} from "../contracts/index.js";
import {
  convertError,
  getBlockfrostV0Client,
  getNetwork,
  invariant,
  mayFailAsync,
} from "../helpers/index.js";
import { fetchDeployedScript } from "../utils/index.js";

/**
 * @interface
 * @typedef {object} PrepareNewMintParams
 * @property {Address} address Wallet Address to perform mint
 * @property {string[]} handles New Handles name to mint
 * @property {string} dbFolderPath Trie DB's Folder Path
 * @property {AssetClass} settingsAssetClass De Mi Contract's Settings Asset Class
 * @property {TxOutputId} settingsAssetTxOutputId De Mi Contract's Settings Asset Tx Output ID
 * @property {AssetClass} mintingDataAssetClass De Mi Contract's Minting Data Asset Class
 * @property {TxOutputId} mintingDataAssetTxOutputId De Mi Contract's Minting Data Asset Tx Output ID
 * @property {string} blockfrostApiKey Blockfrost API Key
 */
interface PrepareNewMintParams {
  address: Address;
  handles: string[];
  dbFolderPath: string;
  settingsAssetClass: AssetClass;
  settingsAssetTxOutputId: TxOutputId;
  mintingDataAssetClass: AssetClass;
  mintingDataAssetTxOutputId: TxOutputId;
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
    },
    Error
  >
> => {
  const {
    address,
    handles,
    dbFolderPath,
    settingsAssetClass,
    settingsAssetTxOutputId,
    mintingDataAssetClass,
    mintingDataAssetTxOutputId,
    blockfrostApiKey,
  } = params;
  const network = getNetwork(blockfrostApiKey);
  const isMainnet = network == "mainnet";
  if (address.era == "Byron")
    return Err(new Error("Byron Address not supported"));
  const blockfrostV0Client = getBlockfrostV0Client(blockfrostApiKey);

  // load trie db from path
  const dbResult = await mayFailAsync(
    async () => (await Trie.load(new Store(dbFolderPath))) as Trie
  ).complete();
  if (!dbResult.ok)
    return Err(new Error(`Couldn't load DB Trie from ${dbFolderPath}`));
  const db = dbResult.data;

  // fetch deployed scripts
  const fetchedResult = await fetchAllDeployedScripts(
    network,
    blockfrostV0Client
  );
  if (!fetchedResult.ok)
    return Err(new Error(`Faied to fetch scripts: ${fetchedResult.error}`));
  const {
    mintProxyScriptTxInput,
    mintV1ScriptDetails,
    mintV1ScriptTxInput,
    mintingDataProxyScriptTxInput,
    mintingDataV1ScriptDetails,
    mintingDataV1ScriptTxInput,
    ordersScriptTxInput,
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
  const { allowed_minters, minter_fee, treasury_address, treasury_fee } =
    settingsV1;

  // fetch minting data
  const mintingDataResult = await fetchMintingData(
    mintingDataAssetClass,
    mintingDataAssetTxOutputId,
    blockfrostApiKey
  );
  if (!mintingDataResult.ok)
    return Err(
      new Error(`Failed to fetch minting data: ${mintingDataResult.error}`)
    );
  const { mintingData, mintingDataTxInput } = mintingDataResult.data;

  // check if current db trie hash is same as minting data root hash
  if (!(mintingData.mpt_root_hash != db.hash.toString("hex"))) {
    return Err(new Error("ERROR: Local DB and On Chain Root Hash mismatch"));
  }

  // make Proofs for Minting Data V1 Redeemer
  const proofs: Proof[] = [];
  for (const handleName of handles) {
    try {
      // NOTE:
      // Have to remove handles if transaction fails
      await db.insert(handleName, "NEW");
      const mpfProof = await db.prove(handleName);
      proofs.push({
        mpt_proof: parseMPTProofJSON(mpfProof.toJSON()),
        handle: {
          handle_name: Buffer.from(handleName).toString("hex"),
          type: "new",
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

  // build redeemer for mint v1
  const mintV1MintHandlesRedeemer = buildMintV1MintHandlesRedeemer();

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
  txBuilder.refer(
    mintProxyScriptTxInput,
    mintV1ScriptTxInput,
    mintingDataProxyScriptTxInput,
    mintingDataV1ScriptTxInput,
    ordersScriptTxInput
  );

  // <-- spend minting data utxo
  txBuilder.spendUnsafe(mintingDataTxInput, makeVoidData());

  // <-- lock minting data value with new root hash
  txBuilder.payUnsafe(
    mintingDataTxInput.address,
    mintingDataValue,
    makeInlineTxOutputDatum(buildMintingData(mintingData))
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

  // <-- withdraw from minting data v1 withdraw validator (script from reference input)
  txBuilder.withdrawUnsafe(
    makeStakingAddress(
      isMainnet,
      makeStakingValidatorHash(mintingDataV1ScriptDetails.validatorHash)
    ),
    0n,
    mintingDataV1MintOrBurnRedeemer
  );

  // <-- pay treasury fee
  txBuilder.payUnsafe(
    treasury_address,
    makeValue(treasury_fee * BigInt(handles.length)),
    makeInlineTxOutputDatum(makeVoidData())
  );

  // <-- pay minter fee
  txBuilder.payUnsafe(
    address,
    makeValue(minter_fee * BigInt(handles.length)),
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
  });
};

interface DeployedScripts {
  mintProxyScriptDetails: ScriptDetails;
  mintProxyScriptTxInput: TxInput;
  mintV1ScriptDetails: ScriptDetails;
  mintV1ScriptTxInput: TxInput;
  mintingDataProxyScriptDetails: ScriptDetails;
  mintingDataProxyScriptTxInput: TxInput;
  mintingDataV1ScriptDetails: ScriptDetails;
  mintingDataV1ScriptTxInput: TxInput;
  ordersScriptDetails: ScriptDetails;
  ordersScriptTxInput: TxInput;
}

const fetchAllDeployedScripts = async (
  network: NetworkName,
  blockfrostV0Client: BlockfrostV0Client
): Promise<Result<DeployedScripts, string>> => {
  try {
    const mintProxyScriptDetails = await fetchDeployedScript(
      network,
      "mint_proxy.mint"
    );
    invariant(
      mintProxyScriptDetails.refScriptUtxo,
      "Mint Proxy has no Ref script UTxO"
    );
    const mintProxyScriptTxInput = await blockfrostV0Client.getUtxo(
      makeTxOutputId(mintProxyScriptDetails.refScriptUtxo)
    );
    if (mintProxyScriptDetails.unoptimizedCbor)
      mintProxyScriptTxInput.output.refScript = (
        mintProxyScriptTxInput.output.refScript as UplcProgramV2
      )?.withAlt(
        decodeUplcProgramV2FromCbor(mintProxyScriptDetails.unoptimizedCbor)
      );

    const mintV1ScriptDetails = await fetchDeployedScript(
      network,
      "mint_v1.withdraw"
    );
    invariant(
      mintV1ScriptDetails.refScriptUtxo,
      "Mint V1 has no Ref script UTxO"
    );
    const mintV1ScriptTxInput = await blockfrostV0Client.getUtxo(
      makeTxOutputId(mintV1ScriptDetails.refScriptUtxo)
    );
    if (mintV1ScriptDetails.unoptimizedCbor)
      mintV1ScriptTxInput.output.refScript = (
        mintV1ScriptTxInput.output.refScript as UplcProgramV2
      )?.withAlt(
        decodeUplcProgramV2FromCbor(mintV1ScriptDetails.unoptimizedCbor)
      );

    const mintingDataProxyScriptDetails = await fetchDeployedScript(
      network,
      "minting_data_proxy.spend"
    );
    invariant(
      mintingDataProxyScriptDetails.refScriptUtxo,
      "Minting Data Proxy has no Ref script UTxO"
    );
    const mintingDataProxyScriptTxInput = await blockfrostV0Client.getUtxo(
      makeTxOutputId(mintingDataProxyScriptDetails.refScriptUtxo)
    );
    if (mintingDataProxyScriptDetails.unoptimizedCbor)
      mintingDataProxyScriptTxInput.output.refScript = (
        mintingDataProxyScriptTxInput.output.refScript as UplcProgramV2
      )?.withAlt(
        decodeUplcProgramV2FromCbor(
          mintingDataProxyScriptDetails.unoptimizedCbor
        )
      );

    const mintingDataV1ScriptDetails = await fetchDeployedScript(
      network,
      "minting_data_v1.withdraw"
    );
    invariant(
      mintingDataV1ScriptDetails.refScriptUtxo,
      "Minting Data V1 has no Ref script UTxO"
    );
    const mintingDataV1ScriptTxInput = await blockfrostV0Client.getUtxo(
      makeTxOutputId(mintingDataV1ScriptDetails.refScriptUtxo)
    );
    if (mintingDataV1ScriptDetails.unoptimizedCbor)
      mintingDataV1ScriptTxInput.output.refScript = (
        mintingDataV1ScriptTxInput.output.refScript as UplcProgramV2
      )?.withAlt(
        decodeUplcProgramV2FromCbor(mintingDataV1ScriptDetails.unoptimizedCbor)
      );

    const ordersScriptDetails = await fetchDeployedScript(
      network,
      "orders.spend"
    );
    invariant(
      ordersScriptDetails.refScriptUtxo,
      "Orders has no Ref script UTxO"
    );
    const ordersScriptTxInput = await blockfrostV0Client.getUtxo(
      makeTxOutputId(ordersScriptDetails.refScriptUtxo)
    );
    if (ordersScriptDetails.unoptimizedCbor)
      ordersScriptTxInput.output.refScript = (
        ordersScriptTxInput.output.refScript as UplcProgramV2
      )?.withAlt(
        decodeUplcProgramV2FromCbor(ordersScriptDetails.unoptimizedCbor)
      );

    return Ok({
      mintProxyScriptDetails,
      mintProxyScriptTxInput,
      mintV1ScriptDetails,
      mintV1ScriptTxInput,
      mintingDataProxyScriptDetails,
      mintingDataProxyScriptTxInput,
      mintingDataV1ScriptDetails,
      mintingDataV1ScriptTxInput,
      ordersScriptDetails,
      ordersScriptTxInput,
    });
  } catch (err) {
    return Err(convertError(err));
  }
};

export type { PrepareNewMintParams };
export { prepareNewMintTransaction };
