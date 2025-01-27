import { TxOutputDatum } from "@helios-lang/ledger";
import {
  expectByteArrayData,
  expectConstrData,
  makeByteArrayData,
  makeConstrData,
  UplcData,
} from "@helios-lang/uplc";
import { invariant } from "helpers/index.js";

import { Destination, OrderDatum } from "../types/index.js";
import {
  buildAddressData,
  buildDatumData,
  decodeAddressFromData,
  decodeDatumFromData,
} from "./common.js";

const decodeDestinationFromData = (data: UplcData): Destination => {
  const constrData = expectConstrData(data, 0, 2);
  const address = decodeAddressFromData(constrData.fields[0]);
  const datum = decodeDatumFromData(constrData.fields[1]);
  return {
    address,
    datum,
  };
};

const buildDestinationData = (destination: Destination): UplcData => {
  const { address, datum } = destination;
  return makeConstrData(0, [buildAddressData(address), buildDatumData(datum)]);
};

const decodeOrderDatum = (datum: TxOutputDatum | undefined): OrderDatum => {
  invariant(
    datum?.kind == "InlineTxOutputDatum",
    "OrderDatum must be inline datum"
  );
  const datumData = datum.data;
  const orderConstrData = expectConstrData(datumData, 0, 3);

  const owner = orderConstrData.fields[0];
  const requested_handle = expectByteArrayData(
    orderConstrData.fields[1]
  ).toHex();
  const destination = decodeDestinationFromData(orderConstrData.fields[2]);

  return {
    owner,
    requested_handle,
    destination,
  };
};

const buildOrderData = (order: OrderDatum): UplcData => {
  const { owner, destination, requested_handle } = order;
  return makeConstrData(0, [
    owner,
    makeByteArrayData(requested_handle),
    buildDestinationData(destination),
  ]);
};

const buildOrderExecuteRedeemer = (): UplcData => {
  return makeConstrData(0, []);
};

const buildOrderCancelRedeemer = (): UplcData => {
  return makeConstrData(1, []);
};

export {
  buildDestinationData,
  buildOrderCancelRedeemer,
  buildOrderData,
  buildOrderExecuteRedeemer,
  decodeDestinationFromData,
  decodeOrderDatum,
};
