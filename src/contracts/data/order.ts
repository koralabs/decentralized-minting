import type { NetworkName } from "../../helpers/cardano-sdk/networkName.js";
import { invariant } from "../../helpers/index.js";
import { OrderDatum } from "../types/index.js";
import {
  buildAddressData,
  decodeAddressFromData,
  expectBytesHex,
  expectConstr,
  expectInt,
  mkBytes,
  mkConstr,
  mkInt,
  PlutusData,
  plutusDataFromCbor,
} from "./plutusData.js";

const decodeOrderDatum = (
  datumCbor: string | undefined,
  network: NetworkName,
): OrderDatum => {
  invariant(datumCbor, "OrderDatum must have inline datum CBOR");
  const data = plutusDataFromCbor(datumCbor);
  const constr = expectConstr(data, 0, 5, "OrderDatum");

  const owner = constr.fields.items[0];
  const requested_handle = expectBytesHex(
    constr.fields.items[1],
    "requested_handle must be ByteArray",
  );
  const destination_address = decodeAddressFromData(
    constr.fields.items[2],
    network,
  );

  // WS5: discount_claim is Option<DiscountClaim> — Constr 0 [claim] (Some) / Constr 1 [] (None).
  const claimOption = expectConstr(
    constr.fields.items[3],
    undefined,
    undefined,
    "discount_claim Option",
  );
  const discount_claim =
    claimOption.constructor === 0n ? claimOption.fields.items[0] : undefined;

  // is_virtual: 0 = root/NFT subhandle, 1 = virtual subhandle.
  const is_virtual = expectInt(constr.fields.items[4], "is_virtual must be Int");

  return {
    owner,
    requested_handle,
    destination_address,
    discount_claim,
    is_virtual,
  };
};

const buildOrderData = (order: OrderDatum): PlutusData => {
  const {
    owner,
    destination_address,
    requested_handle,
    discount_claim,
    is_virtual,
  } = order;
  return mkConstr(0, [
    owner,
    mkBytes(requested_handle),
    buildAddressData(destination_address),
    // Option<DiscountClaim>: Some(claim) or None
    discount_claim ? mkConstr(0, [discount_claim]) : mkConstr(1, []),
    // Subhandle mint kind (0 = root/NFT, 1 = virtual)
    mkInt(is_virtual ?? 0n),
  ]);
};

const buildOrderExecuteRedeemer = (): PlutusData => mkConstr(0, []);

const buildOrderCancelRedeemer = (): PlutusData => mkConstr(1, []);

// WS8: admin refund — OrderRedeemer::Refund (constructor index 2). Authorized by
// the mint_governor withdrawal, returns the order lovelace to the owner; needs no
// order-placer signature.
const buildOrderRefundRedeemer = (): PlutusData => mkConstr(2, []);

export {
  buildOrderCancelRedeemer,
  buildOrderData,
  buildOrderExecuteRedeemer,
  buildOrderRefundRedeemer,
  decodeOrderDatum,
};
