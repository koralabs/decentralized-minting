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
  const handle_name = expectByteArrayData(orderConstrData.fields[1]).toHex();
  const destination_address = decodeAddressFromData(
    orderConstrData.fields[2],
    network
  );

  return {
    owner,
    handle_name,
    destination_address,
  };
};

const buildOrderData = (order: OrderDatum): UplcData => {
  const { owner, handle_name, destination_address } = order;
  return makeConstrData(0, [
    owner,
    makeByteArrayData(handle_name),
    buildAddressData(destination_address),
  ]);
};

const buildOrdersExecuteOrdersRedeemer = (): UplcData => {
  return makeConstrData(0, []);
};

const buildOrdersCancelOrderRedeemer = (): UplcData => {
  return makeConstrData(1, []);
};

export {
  buildOrderData,
  buildOrdersCancelOrderRedeemer,
  buildOrdersExecuteOrdersRedeemer,
  decodeOrderDatum,
};
