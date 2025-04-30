import { Destination } from "./order.js";

interface NewHandle {
  // without asset name label
  hexName: string;
  utf8Name: string;
  destination: Destination;
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
