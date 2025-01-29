import {
  Address,
  makeInlineTxOutputDatum,
  makeValue,
} from "@helios-lang/ledger";
import { makeTxBuilder, NetworkName, TxBuilder } from "@helios-lang/tx-utils";
import { Err, Ok, Result } from "ts-res";

import { GET_CONFIGS } from "../configs/index.js";
import {
  buildContracts,
  buildOrderData,
  makeSignatureMultiSigScriptData,
  OrderDatum,
} from "../contracts/index.js";
import { mayFail } from "../helpers/index.js";

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
  const { MINTER_FEE, TREASURY_FEE } = configsResult.data;
  if (address.era == "Byron")
    return Err(new Error("Byron Address not supported"));
  if (address.spendingCredential.kind == "ValidatorHash")
    return Err(new Error("Must be Base address"));
  const isMainnet = network == "mainnet";

  const contractsConfig = buildContracts({
    network,
  });
  const { order: orderConfig } = contractsConfig;

  const order: OrderDatum = {
    destination: {
      address,
      datum: undefined,
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
    orderConfig.orderScriptAddress,
    makeValue(3_000_000n + MINTER_FEE + TREASURY_FEE),
    makeInlineTxOutputDatum(buildOrderData(order))
  );

  return Ok(txBuilder);
};

export type { RequestParams };
export { request };
