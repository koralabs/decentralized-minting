import { TxOutputDatum } from "@helios-lang/ledger";
import { NetworkName } from "@helios-lang/tx-utils";
import {
  expectByteArrayData,
  expectConstrData,
  expectIntData,
  makeByteArrayData,
  makeConstrData,
  makeIntData,
  UplcData,
} from "@helios-lang/uplc";

import { invariant } from "../../helpers/index.js";
import { Destination, OrderDatum } from "../types/index.js";
import { buildAddressData, decodeAddressFromData } from "./common.js";

const decodeDestinationFromData = (
  data: UplcData,
  network: NetworkName
): Destination => {
  const constrData = expectConstrData(data, 0, 1);
  const address = decodeAddressFromData(constrData.fields[0], network);
  return {
    address,
  };
};

const buildDestinationData = (destination: Destination): UplcData => {
  const { address } = destination;
  return makeConstrData(0, [buildAddressData(address)]);
};

const decodeOrderDatum = (
  datum: TxOutputDatum | undefined,
  network: NetworkName
): OrderDatum => {
  invariant(
    datum?.kind == "InlineTxOutputDatum",
    "OrderDatum must be inline datum"
  );
  const datumData = datum.data;
  const orderConstrData = expectConstrData(datumData, 0, 5);

  const owner = orderConstrData.fields[0];
  const requested_handle = expectByteArrayData(
    orderConstrData.fields[1]
  ).toHex();
  const destination = decodeDestinationFromData(
    orderConstrData.fields[2],
    network
  );

  const is_legacy = expectIntData(orderConstrData.fields[3]).value;
  const is_virtual = expectIntData(orderConstrData.fields[4]).value;

  return {
    owner,
    requested_handle,
    destination,
    is_legacy,
    is_virtual,
  };
};

const buildOrderData = (order: OrderDatum): UplcData => {
  const { owner, destination, requested_handle } = order;
  return makeConstrData(0, [
    owner,
    makeByteArrayData(requested_handle),
    buildDestinationData(destination),
    makeIntData(order.is_legacy),
    makeIntData(order.is_virtual),
  ]);
};

const buildOrderExecuteAsNewRedeemer = (): UplcData => {
  return makeConstrData(0, []);
};

const buildOrderExecuteAsLegacyRedeemer = (): UplcData => {
  return makeConstrData(1, []);
};

const buildOrderCancelRedeemer = (): UplcData => {
  return makeConstrData(2, []);
};

export {
  buildDestinationData,
  buildOrderCancelRedeemer,
  buildOrderData,
  buildOrderExecuteAsLegacyRedeemer,
  buildOrderExecuteAsNewRedeemer,
  decodeDestinationFromData,
  decodeOrderDatum,
};
