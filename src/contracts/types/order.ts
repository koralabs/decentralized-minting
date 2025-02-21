import { ShelleyAddress } from "@helios-lang/ledger";
import { UplcData } from "@helios-lang/uplc";

interface OrderDatum {
  owner: UplcData;
  requested_handle: string; // hex string
  destination: Destination;
}

interface Destination {
  address: ShelleyAddress;
}

export type { Destination, OrderDatum };
