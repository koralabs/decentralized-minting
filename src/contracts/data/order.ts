import { TxOutputDatum } from "@helios-lang/ledger";
import { NetworkName } from "@helios-lang/tx-utils";
import {
  expectByteArrayData,
  expectConstrData,
  makeByteArrayData,
  makeConstrData,
  UplcData,
} from "@helios-lang/uplc";

import { invariant } from "../../helpers/index.js";
import { OrderDatum } from "../types/index.js";
import { buildAddressData, decodeAddressFromData } from "./common.js";

const decodeOrderDatum = (
  datum: TxOutputDatum | undefined,
  network: NetworkName
): OrderDatum => {
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
  const destination_address = decodeAddressFromData(
    orderConstrData.fields[2],
    network
  );

  return {
    owner,
    requested_handle,
    destination_address,
  };
};

const buildOrderData = (order: OrderDatum): UplcData => {
  const { owner, destination_address, requested_handle } = order;
  return makeConstrData(0, [
    owner,
    makeByteArrayData(requested_handle),
    buildAddressData(destination_address),
  ]);
};

const buildOrderExecuteRedeemer = (): UplcData => {
  return makeConstrData(0, []);
};

const buildOrderCancelRedeemer = (): UplcData => {
  return makeConstrData(1, []);
};

export {
  buildOrderCancelRedeemer,
  buildOrderData,
  buildOrderExecuteRedeemer,
  decodeOrderDatum,
};
