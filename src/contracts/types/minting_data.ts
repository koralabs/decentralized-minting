import { MPTProof } from "./mpt.js";

interface MintingData {
  mpt_root_hash: string;
}

// Free-virtual claim for a PRIVATE virtual sub on the DeMi orders path (mirrors
// validations/minting_data/types.FreeVirtualData). Carries the data to update the ROOT key's
// free-NAME set — a second `mpt.update` on the root value:
//   root_proof:      MPT proof for the ROOT key (taken AFTER the sub key is inserted, on mint)
//   root_free_names: the root's current free-virtual name set (hex names; must still have a slot)
//   root_labels:     the root's current label set (hex; preserved across the update)
type FreeVirtualData = {
  root_proof: MPTProof;
  root_free_names: string[];
  root_labels: string;
};

// One per DeMi order (paired 1:1 with the order inputs, same order). Mirrors
// validations/minting_data/types.OrderProof. `free_virtual = Some` marks a PRIVATE virtual sub
// claiming a free slot (no fees, bumps the root's free-name set); `undefined` => None: a paid
// order (root, nft sub, public virtual, or a private virtual past the allowance).
type OrderProof = {
  mpt_proof: MPTProof;
  free_virtual?: FreeVirtualData;
};

// Burn proof for a DeMi-policy handle (root, nft sub, or virtual sub). Mirrors
// validations/minting_data/types.BurnProof — the inverse of a mint: `mpt_proof` proves the key is
// present and deletes it; the `-1` mint destroys the tokens. `free_virtual = Some` when burning a
// name in the root's free set (carries the root proof + current free_names so the contract removes
// the name, reopening that slot); `undefined` => None for nft/root/public/paid burns.
type BurnProof = {
  mpt_proof: MPTProof;
  // handle name as hex (without the asset-name label) — the MPT key
  handle_name: string;
  // whether it's a virtual handle (1 or 0)
  is_virtual: bigint;
  free_virtual?: FreeVirtualData;
  // WS1 orphan reap: a non-inclusion proof of the sub's ROOT key. Set => the contract verifies the
  // root is gone (mpt.miss), authorizing a private orphan's reap; undefined => None (normal burn).
  root_absence?: MPTProof;
};

// Legacy handle proof (mirrors validations/minting_data/types.LegacyHandleProof). Legacy mints
// enforce only uniqueness + correct tokens — no free-virtual allowance (that is DeMi-path-only),
// so there is NO per-proof free-virtual data here.
type LegacyHandleProof = {
  mpt_proof: MPTProof;
  // handle name as hex format without asset name label
  handle_name: string;
  // whether it's virtual handle or not (1 or 0)
  is_virtual: bigint;
};

// WS1 — label-asset registry proof (one per 001/002/… label asset minted/burned).
// Mirrors the on-chain `validations/minting_data/types.LabelAssetProof`.
type LabelAssetProof = {
  mpt_proof: MPTProof;
  // root handle name as hex (the MPT key)
  handle_name: string;
  // 4-byte CIP-67 label prefix being added (+1) / removed (-1), hex
  label: string;
  // the key's current free-virtual name set (hex names; preserved across the label change)
  old_free_names: string[];
  // the key's current canonical label set (hex; "" when empty)
  old_labels: string;
  // +1 to add the label (mint the asset) / -1 to remove it (burn)
  amount: bigint;
};

export type {
  BurnProof,
  FreeVirtualData,
  LabelAssetProof,
  LegacyHandleProof,
  MintingData,
  OrderProof,
};
