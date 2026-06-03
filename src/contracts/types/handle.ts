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
  /**
   * WS5 free-virtual — set for a PRIVATE virtual sub-handle to bump the root's private-virtual
   * counter (and earn the free mint while under the allowance). The engine supplies the root's
   * current count + label set from its tracking; `prepareLegacyMint` does the second MPT update
   * + proof. Omit for nft subs / public virtuals / root handles.
   */
  privateVirtual?: {
    /** Root handle name (UTF-8) — the counter's MPT key. */
    rootUtf8Name: string;
    /** Root's current private-virtual count. */
    preCount: bigint;
    /** Root's current label set (hex). */
    rootLabels: string;
  };
}

export type { LegacyHandle, NewHandle };
