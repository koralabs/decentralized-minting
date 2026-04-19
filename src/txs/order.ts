import type { Cardano as CardanoTypes } from "@cardano-sdk/core";
import { ScriptDetails, ScriptType } from "@koralabs/kora-labs-common";
import { Err, Ok, Result } from "ts-res";

import { fetchHandlePriceInfoData } from "../configs/index.js";
import { HANDLE_PRICE_INFO_HANDLE_NAME } from "../constants/index.js";
import { plutusDataToCbor } from "../contracts/data/plutusData.js";
import {
  buildOrderCancelRedeemer,
  buildOrderData,
  decodeOrderDatum,
  HandlePrices,
  makeSignatureMultiSigScriptData,
  OrderDatum,
} from "../contracts/index.js";
import { fetchBlockfrostUtxos } from "../helpers/cardano-sdk/blockfrostUtxo.js";
import {
  Cardano,
  type NetworkName,
  Serialization,
} from "../helpers/cardano-sdk/index.js";
import { mayFail, mayFailAsync } from "../helpers/index.js";
import {
  calculateHandlePriceFromHandlePriceInfo,
  calculateHandlePriceFromHandlePrices,
  fetchDeployedScript,
} from "../utils/index.js";

interface RequestParams {
  network: NetworkName;
  /** Bech32 payment address — must have both payment + staking credentials. */
  address: string;
  /** Handle name (UTF8). */
  handle: string;
}

/**
 * Build the inline datum + lovelace value for a new order output. The caller
 * places this output at the orders-script address and does its own coin
 * selection. Returns the data needed to construct that output, not a tx.
 *
 * Returning the primitives rather than a half-built tx matches the
 * cardano-sdk style of composition — consumers feed these into their
 * normal build pipeline.
 */
const request = async (params: RequestParams): Promise<
  Result<
    {
      scriptAddress: string;
      lovelace: bigint;
      orderDatumCbor: string;
    },
    Error
  >
> => {
  const { network, address, handle } = params;

  const handlePriceInfoDataResult = await fetchHandlePriceInfoData(
    HANDLE_PRICE_INFO_HANDLE_NAME,
  );
  if (!handlePriceInfoDataResult.ok) {
    return Err(
      new Error(
        `Failed to fetch handle price info: ${handlePriceInfoDataResult.error}`,
      ),
    );
  }
  const { handlePriceInfo } = handlePriceInfoDataResult.data;
  const handlePrice = calculateHandlePriceFromHandlePriceInfo(
    handle,
    handlePriceInfo,
  );

  const parsedAddress = Cardano.Address.fromString(address.trim());
  const base = parsedAddress?.asBase();
  if (!base) return Err(new Error("Must be Base address"));
  const paymentCred = base.getPaymentCredential();
  if (paymentCred.type !== Cardano.CredentialType.KeyHash) {
    return Err(new Error("Payment credential must be a key hash"));
  }

  const ordersScriptDetailsResult = await mayFailAsync(() =>
    fetchDeployedScript(ScriptType.DEMI_ORDERS),
  ).complete();
  if (!ordersScriptDetailsResult.ok) {
    return Err(
      new Error(
        `Failed to fetch deployed orders script: ${ordersScriptDetailsResult.error}`,
      ),
    );
  }
  const ordersScriptDetails = ordersScriptDetailsResult.data;
  const scriptAddress = scriptEnterpriseBech32(
    network,
    ordersScriptDetails.validatorHash,
  );

  const order: OrderDatum = {
    owner: makeSignatureMultiSigScriptData(paymentCred.hash as unknown as string),
    requested_handle: Buffer.from(handle).toString("hex"),
    destination_address: address,
  };

  return Ok({
    scriptAddress,
    lovelace: BigInt(Math.ceil(Number(handlePrice) * 1_000_000)),
    orderDatumCbor: plutusDataToCbor(buildOrderData(order)),
  });
};

interface CancelParams {
  network: NetworkName;
  address: string;
  orderUtxo: CardanoTypes.Utxo;
  walletUtxos: CardanoTypes.Utxo[];
  collateralUtxo?: CardanoTypes.Utxo;
  blockfrostApiKey: string;
  /** Reference-input for the orders script (same script is the spend target). */
  ordersScriptRef?: { txHash: string; outputIndex: number };
}

/**
 * Cancel an order UTxO — spend it back to the owner's address via the orders
 * Plutus script. Returns the primitives needed to build this as a Plutus-spend
 * tx.
 */
const cancel = async (params: CancelParams): Promise<
  Result<{ cancelRedeemerCbor: string; requiredSignerHash: string }, Error>
> => {
  const parsedAddress = Cardano.Address.fromString(params.address.trim());
  const base = parsedAddress?.asBase();
  if (!base) return Err(new Error("Must be Base address"));
  const paymentCred = base.getPaymentCredential();
  if (paymentCred.type !== Cardano.CredentialType.KeyHash) {
    return Err(new Error("Payment credential must be a key hash"));
  }

  return Ok({
    cancelRedeemerCbor: plutusDataToCbor(buildOrderCancelRedeemer()),
    requiredSignerHash: paymentCred.hash as unknown as string,
  });
};

interface FetchOrdersTxInputsParams {
  network: NetworkName;
  ordersScriptDetail: ScriptDetails;
  blockfrostApiKey: string;
}

/**
 * Read the current UTxO set at the orders script address, filtered to those
 * with a well-formed order datum.
 */
const fetchOrdersTxInputs = async (
  params: FetchOrdersTxInputsParams,
): Promise<Result<CardanoTypes.Utxo[], Error>> => {
  const { network, ordersScriptDetail, blockfrostApiKey } = params;

  const scriptAddress = scriptEnterpriseBech32(
    network,
    ordersScriptDetail.validatorHash,
  );

  try {
    const orderUtxos = await fetchBlockfrostUtxos(
      scriptAddress,
      blockfrostApiKey,
      network,
      fetch,
    );

    const validUtxos = orderUtxos.filter((utxo) => {
      const datumCbor = coreInlineDatumToCbor(utxo[1].datum);
      const decodedResult = mayFail(() => decodeOrderDatum(datumCbor, network));
      return decodedResult.ok;
    });

    return Ok(validUtxos);
  } catch (e) {
    return Err(
      new Error(`Failed to fetch order UTxOs: ${String((e as Error).message)}`),
    );
  }
};

interface IsValidOrderTxInputParams {
  network: NetworkName;
  orderUtxo: CardanoTypes.Utxo;
  prevHandlePrices: HandlePrices;
  currentHandlePrices: HandlePrices;
}

const isValidOrderTxInput = async (
  params: IsValidOrderTxInputParams,
): Promise<Result<true, Error>> => {
  const { network, orderUtxo, prevHandlePrices, currentHandlePrices } = params;

  const datumCbor = coreInlineDatumToCbor(orderUtxo[1].datum);
  const orderDatumResult = mayFail(() => decodeOrderDatum(datumCbor, network));
  if (!orderDatumResult.ok) {
    return Err(
      new Error(`Failed to decode order datum: ${orderDatumResult.error}`),
    );
  }
  const { requested_handle } = orderDatumResult.data;
  const handleName = Buffer.from(requested_handle, "hex").toString("utf8");

  const handlePrice = Math.min(
    calculateHandlePriceFromHandlePrices(handleName, prevHandlePrices),
    calculateHandlePriceFromHandlePrices(handleName, currentHandlePrices),
  );
  if (orderUtxo[1].value.coins < BigInt(Math.ceil(Number(handlePrice) * 1_000_000))) {
    return Err(new Error("Insufficient lovelace"));
  }

  return Ok(true);
};

const scriptEnterpriseBech32 = (
  network: NetworkName,
  scriptHash: string,
): string => {
  const credential = {
    type: Cardano.CredentialType.ScriptHash,
    hash: scriptHash as unknown as CardanoTypes.Credential["hash"],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Cardano as any)
    .EnterpriseAddress.fromCredentials(
      network === "mainnet" ? 1 : 0,
      credential,
    )
    .toAddress()
    .toBech32() as string;
};

const coreInlineDatumToCbor = (
  datum: CardanoTypes.TxOut["datum"],
): string | undefined => {
  if (!datum) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Serialization as any).PlutusData.fromCore(datum).toCbor() as string;
};

export type { CancelParams, FetchOrdersTxInputsParams, RequestParams };
export { cancel, fetchOrdersTxInputs, isValidOrderTxInput, request };
