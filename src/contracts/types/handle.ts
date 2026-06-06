interface NewHandle {
  // without asset name label
  hexName: string;
  utf8Name: string;
  destinationAddress: string; // bech32
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
