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
  /**
   * Set ONLY for a FREE private virtual sub claiming a free slot (no fees). Carries the root's
   * CURRENT free-virtual name set + label set so the mint build can perform the second `mpt.update`
   * on the root key (bump its free-name set) and construct the matching `FreeVirtualData` proof.
   * The engine supplies this from its trie/settings tracking; omit for nft subs, public virtuals,
   * root handles, or private virtuals past the allowance (all paid).
   */
  freeVirtual?: {
    /** The root's current free-virtual name set (hex sub names; "" set = []). */
    rootFreeNames: string[];
    /** The root's current label set (hex; "" when empty). */
    rootLabels: string;
  };
}

interface LegacyHandle {
  // without asset name label
  hexName: string;
  utf8Name: string;
  isVirtual: boolean;
}

export type { LegacyHandle, NewHandle };
