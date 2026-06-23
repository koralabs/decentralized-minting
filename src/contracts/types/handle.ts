interface NewHandle {
  // without asset name label
  hexName: string;
  utf8Name: string;
  destinationAddress: string; // bech32
  minterFee: bigint;
  treasuryFee: bigint;
  /**
   * Virtual subhandle (mints a single 000 token to the pz script) vs nft/root (mints 100->pz +
   * 222->dest). Mirrors the order datum's `is_virtual`. Defaults to false (nft/root) when omitted.
   */
  isVirtual?: boolean;
}

interface LegacyHandle {
  // without asset name label
  hexName: string;
  utf8Name: string;
  isVirtual: boolean;
}

export type { LegacyHandle, NewHandle };
