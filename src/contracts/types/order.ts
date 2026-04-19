import type { PlutusData } from "../data/plutusData.js";

interface OrderDatum {
  owner: PlutusData;
  requested_handle: string; // hex string without asset label
  destination_address: string; // bech32
}

export type { OrderDatum };
