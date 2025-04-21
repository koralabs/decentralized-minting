import { ShelleyAddress } from "@helios-lang/ledger";
import { UplcData } from "@helios-lang/uplc";

interface OrderDatum {
  owner: UplcData;
  requested_handle: string; // hex string without asset label
  destination: Destination;
  is_legacy: bigint;
  is_virtual: bigint;
}

interface Destination {
  address: ShelleyAddress;
}

export type { Destination, OrderDatum };
