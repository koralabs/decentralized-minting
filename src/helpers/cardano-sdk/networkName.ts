/**
 * Replaces `@helios-lang/tx-utils`'s `NetworkName`. The tx-building stack no
 * longer depends on Helios, so we keep the set of networks we actually
 * support as a local literal union.
 */
export type NetworkName = "mainnet" | "preprod" | "preview";

export const getNetworkId = (network: NetworkName): 0 | 1 =>
  network === "mainnet" ? 1 : 0;
