import type { MPTProof } from "./mpt.js";

// WS5 — off-chain mirror of decentralized_minting/discount.ak DiscountClaim. The qualifying
// asset must be attached as a reference input on the order-fulfilment tx and share a credential
// with the order's destination; the validator re-checks all of this on-chain.
type DiscountClaim =
  | { type: "rarity"; handle_name: string } // hex; name length sets the tier (1/2/3)
  | { type: "og"; handle_name: string } // hex; the handle's 100 ref datum og_number > 0
  | {
      type: "partner";
      policy_id: string; // hex
      asset_name: string; // hex
      value: string; // hex — the partner-root trie value for this policy
      proof: MPTProof; // membership proof in the $pfp_policy_ids root
    }
  | { type: "hal"; asset_name: string }; // hex; asset under config.hal_policy_id

export type { DiscountClaim };
