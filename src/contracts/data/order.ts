import { invariant } from "../../helpers/index.js";
import type { NetworkName } from "../../helpers/cardano-sdk/networkName.js";
import { OrderDatum } from "../types/index.js";
import {
  buildAddressData,
  decodeAddressFromData,
  expectBytesHex,
  expectConstr,
  mkBytes,
  mkConstr,
  PlutusData,
  plutusDataFromCbor,
} from "./plutusData.js";

const decodeOrderDatum = (
  datumCbor: string | undefined,
  network: NetworkName,
): OrderDatum => {
  invariant(datumCbor, "OrderDatum must have inline datum CBOR");
  const data = plutusDataFromCbor(datumCbor);
  const constr = expectConstr(data, 0, 3, "OrderDatum");

  const owner = constr.fields.items[0];
  const requested_handle = expectBytesHex(
    constr.fields.items[1],
    "requested_handle must be ByteArray",
  );
  const destination_address = decodeAddressFromData(
    constr.fields.items[2],
    network,
  );

  return { owner, requested_handle, destination_address };
};

const buildOrderData = (order: OrderDatum): PlutusData => {
  const { owner, destination_address, requested_handle } = order;
  return mkConstr(0, [
    owner,
    mkBytes(requested_handle),
    buildAddressData(destination_address),
  ]);
};

const buildOrderExecuteRedeemer = (): PlutusData => mkConstr(0, []);

const buildOrderCancelRedeemer = (): PlutusData => mkConstr(1, []);

export {
  buildOrderCancelRedeemer,
  buildOrderData,
  buildOrderExecuteRedeemer,
  decodeOrderDatum,
};
