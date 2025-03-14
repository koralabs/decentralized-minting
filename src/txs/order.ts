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

import { fetchSettings } from "../configs/index.js";
import {
  buildOrderCancelRedeemer,
  buildOrderData,
  decodeOrderDatum,
  makeSignatureMultiSigScriptData,
  OrderDatum,
} from "../contracts/index.js";
import {
  getBlockfrostV0Client,
  mayFail,
  mayFailAsync,
} from "../helpers/index.js";
import { fetchDeployedScript } from "../utils/contract.js";

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

  // fetch settings
  const settingsResult = await fetchSettings(network);
  if (!settingsResult.ok) return Err(new Error(settingsResult.error));
  const { settingsV1 } = settingsResult.data;
  const { minter_fee, treasury_fee } = settingsV1;
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
    destination: {
      address,
    },
    owner: makeSignatureMultiSigScriptData(address.spendingCredential),
    requested_handle: Buffer.from(handle).toString("hex"),
  };

  // start building tx
  const txBuilder = makeTxBuilder({
    isMainnet,
  });

  // <-- lock order
  txBuilder.payUnsafe(
    ordersScriptAddress,
    makeValue(3_000_000n + minter_fee + treasury_fee),
    makeInlineTxOutputDatum(buildOrderData(order))
  );

  return Ok(txBuilder);
};

/**
 * @interface
 * @typedef {object} CancelParmas
 * @property {NetworkName} network Network
 * @property {Address} address User's Wallet Address to perform order
 * @property {TxInput} orderTxInput Order Tx Input
 */
interface CancelParmas {
  network: NetworkName;
  address: Address;
  orderTxInput: TxInput;
}

/**
 * @description Request handle to be minted
 * @param {CancelParmas} params
 * @returns {Promise<Result<TxBuilder,  Error>>} Transaction Result
 */
const cancel = async (
  params: CancelParmas
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

export type { CancelParmas, FetchOrdersTxInputsParams, RequestParams };
export { cancel, fetchOrdersTxInputs, request };
