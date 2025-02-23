import {
  Address,
  makeInlineTxOutputDatum,
  makeValue,
  TxInput,
} from "@helios-lang/ledger";
import { makeTxBuilder, NetworkName, TxBuilder } from "@helios-lang/tx-utils";
import { Err, Ok, Result } from "ts-res";

import { GET_CONFIGS } from "../configs/index.js";
import {
  buildContracts,
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

/**
 * @interface
 * @typedef {object} RequestParams
 * @property {NetworkName} network Network
 * @property {Address} address Wallet Address to perform mint
 * @property {string} handleName Handle Name to order (UTF8 format)
 */
interface RequestParams {
  network: NetworkName;
  address: Address;
  handleName: string;
}

/**
 * @description Request handle to be minted
 * @param {RequestParams} params
 * @returns {Promise<Result<TxBuilder,  Error>>} Transaction Result
 */
const request = async (
  params: RequestParams
): Promise<Result<TxBuilder, Error>> => {
  const { network, address, handleName } = params;
  const configsResult = mayFail(() => GET_CONFIGS(network));
  if (!configsResult.ok) return Err(new Error(configsResult.error));
  const { MINT_VERSION, GOD_VERIFICATION_KEY_HASH, MINTER_FEE, TREASURY_FEE } =
    configsResult.data;
  if (address.era == "Byron")
    return Err(new Error("Byron Address not supported"));
  if (address.spendingCredential.kind == "ValidatorHash")
    return Err(new Error("Must be Base address"));
  const isMainnet = network == "mainnet";

  const contractsConfig = buildContracts({
    network,
    mint_version: MINT_VERSION,
    god_verification_key_hash: GOD_VERIFICATION_KEY_HASH,
  });
  const { orders: ordersConfig } = contractsConfig;

  const order: OrderDatum = {
    destination: {
      address,
    },
    owner: makeSignatureMultiSigScriptData(address.spendingCredential),
    requested_handle: Buffer.from(handleName).toString("hex"),
  };

  // start building tx
  const txBuilder = makeTxBuilder({
    isMainnet,
  });

  // <-- lock order
  txBuilder.payUnsafe(
    ordersConfig.ordersValidatorAddress,
    makeValue(3_000_000n + MINTER_FEE + TREASURY_FEE),
    makeInlineTxOutputDatum(buildOrderData(order))
  );

  return Ok(txBuilder);
};

/**
 * @interface
 * @typedef {object} RequestParams
 * @property {NetworkName} network Network
 * @property {Address} address Wallet Address to perform mint
 * @property {string} handleName Handle Name to order (UTF8 format)
 */
interface FetchOrdersUTxOsParams {
  network: NetworkName;
}

/**
 * @description Fetch Orders UTxOs
 * @param {FetchOrdersUTxOsParams} params
 * @param {string} blockfrostApiKey Blockfrost API Key
 * @returns {Promise<Result<TxBuilder,  Error>>} Transaction Result
 */
const fetchOrdersUTxOs = async (
  params: FetchOrdersUTxOsParams,
  blockfrostApiKey: string
): Promise<Result<TxInput[], Error>> => {
  const { network } = params;
  const configsResult = mayFail(() => GET_CONFIGS(network));
  if (!configsResult.ok) return Err(new Error(configsResult.error));
  const { MINT_VERSION, GOD_VERIFICATION_KEY_HASH } = configsResult.data;

  const contractsConfig = buildContracts({
    network,
    mint_version: MINT_VERSION,
    god_verification_key_hash: GOD_VERIFICATION_KEY_HASH,
  });
  const { orders: ordersConfig } = contractsConfig;
  const blockfrostV0Client = getBlockfrostV0Client(blockfrostApiKey);

  // fetch order utxos
  const orderUtxosResult = await mayFailAsync(() =>
    blockfrostV0Client.getUtxos(ordersConfig.ordersValidatorAddress)
  ).complete();
  if (!orderUtxosResult.ok)
    return Err(
      new Error(`Failed to fetch order UTxOs: ${orderUtxosResult.error}`)
    );

  // remove invalid order utxos
  const orderUtxos = orderUtxosResult.data.filter((utxo) => {
    const decodedResult = mayFail(() => decodeOrderDatum(utxo.datum));
    return decodedResult.ok;
  });

  return Ok(orderUtxos);
};

export type { FetchOrdersUTxOsParams, RequestParams };
export { fetchOrdersUTxOs, request };
