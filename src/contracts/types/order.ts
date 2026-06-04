import type { PlutusData } from "../data/plutusData.js";

interface OrderDatum {
  owner: PlutusData;
  requested_handle: string; // hex string without asset label
  destination_address: string; // bech32
  // WS5: optional discount claim (raw PlutusData of the DiscountClaim). Omitted => None (full price).
  discount_claim?: PlutusData;
  // Subhandle mint kind: 0n = root / NFT subhandle, 1n = virtual subhandle.
  // Appended last in the on-chain Constr; the engine reads it to mint 000 vs 100/222.
  is_virtual: bigint;
}

export type { OrderDatum };
