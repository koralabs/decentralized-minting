import {
  Address,
  makeAddress,
  makeInlineTxOutputDatum,
  makeValidatorHash,
  makeValue,
  TxInput,
} from "@helios-lang/ledger";
import { makeTxBuilder, NetworkName, TxBuilder } from "@helios-lang/tx-utils";
import { decodeUplcProgramV2FromCbor } from "@helios-lang/uplc";
import { ScriptDetails, ScriptType } from "@koralabs/kora-labs-common";
import { Err, Ok, Result } from "ts-res";

import { fetchHandlePriceInfoData } from "../configs/index.js";
import { HANDLE_PRICE_INFO_HANDLE_NAME } from "../constants/index.js";
import {
  buildOrderCancelRedeemer,
  buildOrderData,
  decodeOrderDatum,
  HandlePrices,
  makeSignatureMultiSigScriptData,
  OrderDatum,
} from "../contracts/index.js";
import {
  getBlockfrostV0Client,
  mayFail,
  mayFailAsync,
} from "../helpers/index.js";
import {
  calculateHandlePriceFromHandlePriceInfo,
  calculateHandlePriceFromHandlePrices,
  fetchDeployedScript,
} from "../utils/index.js";

/**
 * @interface
 * @typedef {object} RequestParams
 * @property {NetworkName} network Network
 * @property {Address} address User's Wallet Address to perform order
 * @property {string} handle Handle Name to order (UTF8 format)
 */
interface RequestParams {
  network: NetworkName;
  address: Address;
  handle: string;
}

/**
 * @description Request handle to be minted
 * @param {RequestParams} params
 * @returns {Promise<Result<TxBuilder,  Error>>} Transaction Result
 */
const request = async (
  params: RequestParams
): Promise<Result<TxBuilder, Error>> => {
  const { network, address, handle } = params;

  // get handle price
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
  const { handlePriceInfo } = handlePriceInfoDataResult.data;
  const handlePrice = calculateHandlePriceFromHandlePriceInfo(
    handle,
    handlePriceInfo
  );

  const isMainnet = network == "mainnet";
  if (address.era == "Byron")
    return Err(new Error("Byron Address not supported"));
  if (address.spendingCredential.kind == "ValidatorHash")
    return Err(new Error("Must be Base address"));

  // fetch orders script
  const ordersScriptDetailsResult = await mayFailAsync(() =>
    fetchDeployedScript(ScriptType.DEMI_ORDERS)
  ).complete();
  if (!ordersScriptDetailsResult.ok)
    return Err(
      new Error(
        `Failed to fetch deployed orders script: ${ordersScriptDetailsResult.error}`
      )
    );
  const ordersScriptDetails = ordersScriptDetailsResult.data;
  const ordersScriptAddress = makeAddress(
    isMainnet,
    makeValidatorHash(ordersScriptDetails.validatorHash)
  );

  const order: OrderDatum = {
    owner: makeSignatureMultiSigScriptData(address.spendingCredential),
    requested_handle: Buffer.from(handle).toString("hex"),
    destination_address: address,
  };

  // start building tx
  const txBuilder = makeTxBuilder({
    isMainnet,
  });

  // <-- lock order
  txBuilder.payUnsafe(
    ordersScriptAddress,
    makeValue(handlePrice),
    makeInlineTxOutputDatum(buildOrderData(order))
  );

  return Ok(txBuilder);
};

/**
 * @interface
 * @typedef {object} CancelParams
 * @property {NetworkName} network Network
 * @property {Address} address User's Wallet Address to perform order
 * @property {TxInput} orderTxInput Order Tx Input
 */
interface CancelParams {
  network: NetworkName;
  address: Address;
  orderTxInput: TxInput;
}

/**
 * @description Request handle to be minted
 * @param {CancelParams} params
 * @returns {Promise<Result<TxBuilder,  Error>>} Transaction Result
 */
const cancel = async (
  params: CancelParams
): Promise<Result<TxBuilder, Error>> => {
  const { network, address, orderTxInput } = params;

  const isMainnet = network == "mainnet";
  if (address.era == "Byron")
    return Err(new Error("Byron Address not supported"));
  if (address.spendingCredential.kind == "ValidatorHash")
    return Err(new Error("Must be Base address"));

  // fetch orders script
  const ordersScriptDetailsResult = await mayFailAsync(() =>
    fetchDeployedScript(ScriptType.DEMI_ORDERS)
  ).complete();
  if (!ordersScriptDetailsResult.ok)
    return Err(
      new Error(
        `Failed to fetch deployed orders script: ${ordersScriptDetailsResult.error}`
      )
    );
  const ordersScriptDetails = ordersScriptDetailsResult.data;

  // make Order Uplc Program
  if (!ordersScriptDetails.cbor || !ordersScriptDetails.unoptimizedCbor)
    return Err(new Error(`Order Script Detail doesn't have CBOR`));
  const orderUplcProgram = decodeUplcProgramV2FromCbor(
    ordersScriptDetails.cbor
  ).withAlt(decodeUplcProgramV2FromCbor(ordersScriptDetails.unoptimizedCbor));

  // start building tx
  const txBuilder = makeTxBuilder({
    isMainnet,
  });

  // <-- attach order script
  txBuilder.attachUplcProgram(orderUplcProgram);

  // <-- spend order tx input
  txBuilder.spendUnsafe(orderTxInput, buildOrderCancelRedeemer());

  // <-- add signer
  txBuilder.addSigners(address.spendingCredential);

  return Ok(txBuilder);
};

/**
 * @interface
 * @typedef {object} RequestParams
 * @property {NetworkName} network Network
 * @property {Address} address Wallet Address to perform mint
 * @property {string} handleName Handle Name to order (UTF8 format)
 * @property {string} blockfrostApiKey Blockfrost API Key
 */
interface FetchOrdersTxInputsParams {
  network: NetworkName;
  ordersScriptDetail: ScriptDetails;
  blockfrostApiKey: string;
}

/**
 * @description Fetch Orders UTxOs
 * @param {FetchOrdersTxInputsParams} params
 * @returns {Promise<Result<TxBuilder,  Error>>} Transaction Result
 */
const fetchOrdersTxInputs = async (
  params: FetchOrdersTxInputsParams
): Promise<Result<TxInput[], Error>> => {
  const { network, ordersScriptDetail, blockfrostApiKey } = params;
  const isMainnet = network == "mainnet";
  const blockfrostV0Client = getBlockfrostV0Client(blockfrostApiKey);

  // fetch order utxos
  const orderUtxosResult = await mayFailAsync(() =>
    blockfrostV0Client.getUtxos(
      makeAddress(
        isMainnet,
        makeValidatorHash(ordersScriptDetail.validatorHash)
      )
    )
  ).complete();
  if (!orderUtxosResult.ok)
    return Err(
      new Error(`Failed to fetch order UTxOs: ${orderUtxosResult.error}`)
    );

  // remove invalid order utxos
  const orderUtxos = orderUtxosResult.data.filter((utxo) => {
    const decodedResult = mayFail(() => decodeOrderDatum(utxo.datum, network));
    return decodedResult.ok;
  });

  return Ok(orderUtxos);
};

/**
 * @interface
 * @typedef {object} IsValidOrderTxInputParams
 * @property {NetworkName} network Network
 * @property {TxInput} orderTxInput Order Tx Input
 * @property {HandlePrices} prevHandlePrices Previous Handle Prices
 * @property {HandlePrices} currentHandlePrices Current (Latest) Handle Prices
 */
interface IsValidOrderTxInputParams {
  network: NetworkName;
  orderTxInput: TxInput;
  prevHandlePrices: HandlePrices;
  currentHandlePrices: HandlePrices;
}

/**
 * @description Check if the order tx input is valid
 * @param {IsValidOrderTxInputParams} params
 * @returns {Promise<Result<true, Error>>} Result
 */
const isValidOrderTxInput = async (
  params: IsValidOrderTxInputParams
): Promise<Result<true, Error>> => {
  const { network, orderTxInput, prevHandlePrices, currentHandlePrices } =
    params;

  const orderDatumResult = mayFail(() =>
    decodeOrderDatum(orderTxInput.datum, network)
  );
  if (!orderDatumResult.ok)
    return Err(
      new Error(`Failed to decode order datum: ${orderDatumResult.error}`)
    );
  const { requested_handle } = orderDatumResult.data;
  const handleName = Buffer.from(requested_handle, "hex").toString("utf8");

  const handlePrice = Math.min(
    calculateHandlePriceFromHandlePrices(handleName, prevHandlePrices),
    calculateHandlePriceFromHandlePrices(handleName, currentHandlePrices)
  );
  if (orderTxInput.value.lovelace < BigInt(handlePrice * 1_000_000))
    return Err(new Error("Insufficient lovelace"));

  return Ok(true);
};

export type { CancelParams, FetchOrdersTxInputsParams, RequestParams };
export { cancel, fetchOrdersTxInputs, isValidOrderTxInput, request };
