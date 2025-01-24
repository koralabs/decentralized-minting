import { TxOutputDatum } from "@helios-lang/ledger";
import {
  expectByteArrayData,
  expectConstrData,
  UplcData,
} from "@helios-lang/uplc";
import { invariant } from "helpers/index.js";

import { Destination, OrderDatum } from "../types/index.js";
import { decodeAddressFromData, decodeDatumFromData } from "./common.js";

const decodeDestinationFromData = (data: UplcData): Destination => {
  const constrData = expectConstrData(data, 0, 2);
  const address = decodeAddressFromData(constrData.fields[0]);
  const datum = decodeDatumFromData(constrData.fields[1]);
  return {
    address,
    datum,
  };
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

export { decodeOrderDatum };
