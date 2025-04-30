import { ShelleyAddress } from "@helios-lang/ledger";
import { UplcData } from "@helios-lang/uplc";

interface OrderDatum {
  owner: UplcData;
  requested_handle: string; // hex string without asset label
  destination_address: ShelleyAddress;
}

export type { OrderDatum };
