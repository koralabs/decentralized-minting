import { makeInlineTxOutputDatum, makeValue } from "@helios-lang/ledger";
import { makeTxBuilder, NetworkName } from "@helios-lang/tx-utils";
import { Err, Result } from "ts-res";

import { GET_CONFIGS } from "../configs/index.js";
import {
  buildContracts,
  buildOrderData,
  makeSignatureMultiSigScriptData,
  OrderDatum,
} from "../contracts/index.js";
import {
  BuildTxError,
  mayFail,
  mayFailTransaction,
  TxSuccessResult,
} from "../helpers/index.js";
import { WalletWithoutKey } from "./types.js";

/**
 * @interface
 * @typedef {object} RequestParams
 * @property {NetworkName} network Network
 * @property {WalletWithoutKey} walletWithoutKey Wallet without key, used to build transaction
 * @property {string} handleName Handle Name to order (UTF8 format)
 */
interface RequestParams {
  network: NetworkName;
  walletWithoutKey: WalletWithoutKey;
  handleName: string;
}

/**
 * @description Request handle to be minted
 * @param {RequestParams} params
 * @returns {Promise<Result<TxSuccessResult,  Error | BuildTxError>>} Transaction Result
 */
const request = async (
  params: RequestParams
): Promise<Result<TxSuccessResult, Error | BuildTxError>> => {
  const { network, walletWithoutKey, handleName } = params;
  const configsResult = mayFail(() => GET_CONFIGS(network));
  if (!configsResult.ok) return Err(new Error(configsResult.error));
  const { MINTER_FEE, TREASURY_FEE } = configsResult.data;
  const { address, utxos } = walletWithoutKey;
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

  const txResult = await mayFailTransaction(
    txBuilder,
    address,
    utxos
  ).complete();
  return txResult;
};

export { request };
