import { Address, TxOutputDatum } from "@helios-lang/ledger";
import { UplcData } from "@helios-lang/uplc";

interface OrderDatum {
  owner: UplcData;
  requested_handle: string; // hex string
  destination: Destination;
}

interface Destination {
  address: Address;
  datum: TxOutputDatum | undefined;
}

export type { Destination, OrderDatum };
