import { ShelleyAddress } from "@helios-lang/ledger";
import { UplcData } from "@helios-lang/uplc";

interface OrderDatum {
  // the key hash of the wallet that placed the order that is used for cancelling the order
  owner: UplcData;
  // without asset name label
  handle_name: string;
  // the address the Handle should be sent to
  destination_address: ShelleyAddress;
}

export type { OrderDatum };
