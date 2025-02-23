import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import { ByteArrayLike, IntLike } from "@helios-lang/codec-utils";
import {
  Address,
  makeAssetClass,
  makeAssets,
  makeInlineTxOutputDatum,
  makePubKeyHash,
  makeValue,
  TxInput,
} from "@helios-lang/ledger";
import {
  makeBlockfrostV0Client,
  makeTxBuilder,
  NetworkName,
  TxBuilder,
} from "@helios-lang/tx-utils";
import { PREFIX_100, PREFIX_222 } from "constants/index.js";
import { Err, Ok, Result } from "ts-res";

import { GET_CONFIGS } from "../configs/index.js";
import {
  buildContracts,
  buildMintingData,
  buildMintingDataV1MintOrBurnRedeemer,
  buildMintV1MintHandlesRedeemer,
  buildOrderExecuteRedeemer,
  decodeMintingDataDatum,
  decodeOrderDatum,
  decodeSettingsDatum,
  decodeSettingsV1Data,
  makeVoidData,
  parseMPTProofJSON,
  Proof,
} from "../contracts/index.js";
import { mayFail, mayFailAsync } from "../helpers/index.js";

/**
 * @interface
 * @typedef {object} MintParams
 * @property {NetworkName} network Network
 * @property {Address} address Wallet Address to perform mint
 * @property {Trie} db MPF Database for all handles
 * @property {TxInput[]} ordersUTxOs UTxOs in Orders script (user requested)
 */
interface MintParams {
  network: NetworkName;
  address: Address;
  db: Trie;
  ordersUTxOs: TxInput[];
}

/**
 * @description Mint Handles from Order
 * @param {MintParams} params
 * @param {string} blockfrostApiKey Blockfrost API Key
 * @returns {Promise<Result<TxBuilder,  Error>>} Transaction Result
 */
const mint = async (
  params: MintParams,
  blockfrostApiKey: string
): Promise<Result<TxBuilder, Error>> => {
  const { network, address, db, ordersUTxOs } = params;
  const configsResult = mayFail(() => GET_CONFIGS(network));
  if (!configsResult.ok) return Err(new Error(configsResult.error));
  const {
    MINT_VERSION,
    GOD_VERIFICATION_KEY_HASH,
    MINTING_DATA_ASSET_CLASS,
    ALLOWED_MINTERS,
    TREASURY_FEE,
    MINTER_FEE,
    PZ_UTXO_MIN_LOVELACE,
    SETTINGS_ASSET_UTXO_ID,
    MINT_V1_SCRIPT_UTXO_ID,
    MINTINT_DATA_V1_SCRIPT_UTXO_ID,
  } = configsResult.data;
  if (address.era == "Byron")
    return Err(new Error("Byron Address not supported"));
  const isMainnet = network == "mainnet";

  const blockfrostV0Client = makeBlockfrostV0Client(network, blockfrostApiKey);

  const contractsConfig = buildContracts({
    network,
    mint_version: MINT_VERSION,
    god_verification_key_hash: GOD_VERIFICATION_KEY_HASH,
  });
  const {
    mintV1: mintV1Config,
    mintProxy: mintProxyConfig,
    mintingData: mintingDataConfig,
    mintingDataV1: mintingDataV1Config,
    orders: ordersConfig,
    handlePolicyHash,
  } = contractsConfig;

  // fetch mint v1 ref script
  const mintV1ScriptUtxoResult = await mayFailAsync(() =>
    blockfrostV0Client.getUtxo(MINT_V1_SCRIPT_UTXO_ID)
  ).complete();
  if (!mintV1ScriptUtxoResult.ok)
    return Err(
      new Error(
        `Failed to fetch Mint V1 Reference Script: ${mintV1ScriptUtxoResult.error}`
      )
    );
  const mintV1ScriptUtxo = mintV1ScriptUtxoResult.data;

  // fetch mint v1 ref script
  const mintingDataV1ScriptUtxoResult = await mayFailAsync(() =>
    blockfrostV0Client.getUtxo(MINTINT_DATA_V1_SCRIPT_UTXO_ID)
  ).complete();
  if (!mintingDataV1ScriptUtxoResult.ok)
    return Err(
      new Error(
        `Failed to fetch Minting Data V1 Reference Script: ${mintingDataV1ScriptUtxoResult.error}`
      )
    );
  const mintingDataV1ScriptUtxo = mintingDataV1ScriptUtxoResult.data;

  // fetch settings asset utxo
  const settingsAssetUtxoResult = await mayFailAsync(() =>
    blockfrostV0Client.getUtxo(SETTINGS_ASSET_UTXO_ID)
  ).complete();
  if (!settingsAssetUtxoResult.ok)
    return Err(
      new Error(
        `Failed to fetch Settings Asset UTxO: ${settingsAssetUtxoResult.error}`
      )
    );
  const settingsAssetUtxo = settingsAssetUtxoResult.data;

  // fetch minting data asset
  const mintingDataAssetAddress =
    mintingDataConfig.mintingDataProxyValidatorAddress;
  const mintingDataAssetUtxoResult = await mayFailAsync(
    async () =>
      (
        await blockfrostV0Client.getUtxosWithAssetClass(
          mintingDataAssetAddress,
          MINTING_DATA_ASSET_CLASS
        )
      )[0]
  ).complete();
  if (!mintingDataAssetUtxoResult.ok)
    return Err(
      new Error(
        `Failed to fetch Minting Data Asset: ${mintingDataAssetUtxoResult.error}`
      )
    );
  const mintingDataAssetUtxo = mintingDataAssetUtxoResult.data;

  // decode settings and settings v1
  const decodedSettings = decodeSettingsDatum(settingsAssetUtxo.output.datum);
  const decodedSettingsV1 = decodeSettingsV1Data(decodedSettings.data);

  // decode minting data
  const decodedMintingData = decodeMintingDataDatum(
    mintingDataAssetUtxo.output.datum
  );

  const handles = [];
  const proofs: Proof[] = [];

  // NOTE:
  // sort orderUtxos before process
  // because tx inputs is sorted lexicographically
  // we have to insert handle in same order as tx inputs
  ordersUTxOs.sort((a, b) => (a.id.toString() > b.id.toString() ? 1 : -1));
  if (ordersUTxOs.length == 0) return Err(new Error("No Order requested"));
  console.log(`${ordersUTxOs.length} Handles are ordered`);

  for (const orderUtxo of ordersUTxOs) {
    const decodedOrder = decodeOrderDatum(orderUtxo.datum);
    const handleName = Buffer.from(
      decodedOrder.requested_handle,
      "hex"
    ).toString();
    const refHandleAssetClass = makeAssetClass(
      handlePolicyHash,
      `${PREFIX_100}${decodedOrder.requested_handle}`
    );
    const userHandleAssetClass = makeAssetClass(
      handlePolicyHash,
      `${PREFIX_222}${decodedOrder.requested_handle}`
    );
    const lovelace = orderUtxo.value.lovelace;
    const refHandleValue = makeValue(
      PZ_UTXO_MIN_LOVELACE,
      makeAssets([[refHandleAssetClass, 1n]])
    );
    const userHandleValue = makeValue(
      lovelace - (TREASURY_FEE + MINTER_FEE),
      makeAssets([[userHandleAssetClass, 1n]])
    );
    const destinationAddress = decodedOrder.destination.address;

    try {
      await db.insert(handleName, "NEW");
      const mpfProof = await db.prove(handleName);
      proofs.push({
        mpt_proof: parseMPTProofJSON(mpfProof.toJSON()),
        handle: { handle_name: decodedOrder.requested_handle, type: "new" },
        amount: 1n,
      });
      handles.push({
        orderUtxo,
        destinationAddress,
        refHandleValue,
        userHandleValue,
        refHandleAssetClass,
        userHandleAssetClass,
      });
    } catch (e) {
      console.warn("Handle already exists", decodedOrder.requested_handle, e);
      return Err(new Error(`Handle "${handleName}" already exists`));
    }
  }

  // update all handles in minting data
  decodedMintingData.mpt_root_hash = db.hash.toString("hex");

  // minting data asset value
  const mintingDataValue = makeValue(
    2_000_000n,
    makeAssets([[MINTING_DATA_ASSET_CLASS, 1n]])
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
  txBuilder.addSigners(makePubKeyHash(ALLOWED_MINTERS[0]));

  // <-- attach settings asset as reference input
  txBuilder.refer(settingsAssetUtxo);

  // <-- attach minting data proxy spending validator
  txBuilder.attachUplcProgram(
    mintingDataConfig.mintingDataProxySpendUplcProgram
  );

  // <-- spend minting data utxo
  txBuilder.spendUnsafe(mintingDataAssetUtxo, makeVoidData());

  // <-- lock minting data value with new root hash
  txBuilder.payUnsafe(
    mintingDataAssetAddress,
    // mintingDataValue,
    mintingDataAssetUtxo.value,
    makeInlineTxOutputDatum(buildMintingData(decodedMintingData))
  );

  // <-- add mint v1 script to reference input
  txBuilder.refer(mintV1ScriptUtxo);

  // <-- withdraw from mint v1 withdraw validator (script from reference input)
  txBuilder.withdrawUnsafe(
    mintV1Config.mintV1StakingAddress,
    0n,
    mintV1MintHandlesRedeemer
  );

  // <-- add minting data v1 script to reference input
  txBuilder.refer(mintingDataV1ScriptUtxo);

  // <-- withdraw from minting data v1 withdraw validator (script from reference input)
  txBuilder.withdrawUnsafe(
    mintingDataV1Config.mintingDataV1StakingAddress,
    0n,
    mintingDataV1MintOrBurnRedeemer
  );

  // <-- pay treasury fee
  txBuilder.payUnsafe(
    decodedSettingsV1.treasury_address,
    makeValue(decodedSettingsV1.treasury_fee * BigInt(handles.length)),
    makeInlineTxOutputDatum(makeVoidData())
  );

  // <-- pay minter fee
  txBuilder.payUnsafe(
    address,
    makeValue(decodedSettingsV1.minter_fee * BigInt(handles.length)),
    makeInlineTxOutputDatum(makeVoidData())
  );

  // <-- attach mint prxoy validator
  txBuilder.attachUplcProgram(mintProxyConfig.mintProxyMintUplcProgram);

  // <-- attach order script
  txBuilder.attachUplcProgram(ordersConfig.ordersSpendUplcProgram);

  // <-- spend order utxos and mint handle
  // and send minted handle to destination with datum
  const mintingHandlesTokensValue: [ByteArrayLike, IntLike][] = [];
  handles.forEach((handle) =>
    mintingHandlesTokensValue.push(
      [handle.refHandleAssetClass.tokenName, 1n],
      [handle.userHandleAssetClass.tokenName, 1n]
    )
  );
  txBuilder.mintPolicyTokensUnsafe(
    handlePolicyHash,
    mintingHandlesTokensValue,
    makeVoidData()
  );
  for (const handle of handles) {
    txBuilder
      .spendUnsafe(handle.orderUtxo, buildOrderExecuteRedeemer())
      .payUnsafe(decodedSettingsV1.pz_script_address, handle.refHandleValue)
      .payUnsafe(handle.destinationAddress, handle.userHandleValue);
  }

  return Ok(txBuilder);
};

export type { MintParams };
export { mint };
