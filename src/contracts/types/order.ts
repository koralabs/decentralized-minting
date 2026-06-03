import type { PlutusData } from "../data/plutusData.js";

interface OrderDatum {
  owner: PlutusData;
  requested_handle: string; // hex string without asset label
  destination_address: string; // bech32
  // WS5: optional discount claim (raw PlutusData of the DiscountClaim). Omitted => None (full price).
  discount_claim?: PlutusData;
}

export type { OrderDatum };
