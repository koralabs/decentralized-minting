import { ShelleyAddress } from "@helios-lang/ledger";

interface NewHandle {
  // without asset name label
  hexName: string;
  utf8Name: string;
  destinationAddress: ShelleyAddress;
  minterFee: bigint;
  treasuryFee: bigint;
}

interface LegacyHandle {
  // without asset name label
  hexName: string;
  utf8Name: string;
  isVirtual: boolean;
}

export type { LegacyHandle, NewHandle };
