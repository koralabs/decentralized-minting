import { MPTProof } from "./mpt.js";

interface MintingData {
  mpt_root_hash: string;
}

// One per DeMi order (paired 1:1 with the order inputs, same order). Mirrors
// validations/minting_data/types.OrderProof. A paid order (root, nft sub, public virtual, or
// private virtual); `mpt_proof` inserts the handle's own key.
type OrderProof = {
  mpt_proof: MPTProof;
};

// Burn proof for a DeMi-policy handle (root, nft sub, or virtual sub). Mirrors
// validations/minting_data/types.BurnProof — the inverse of a mint: `mpt_proof` proves the key is
// present and deletes it; the `-1` mint destroys the tokens.
type BurnProof = {
  mpt_proof: MPTProof;
  // handle name as hex (without the asset-name label) — the MPT key
  handle_name: string;
  // whether it's a virtual handle (1 or 0)
  is_virtual: bigint;
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
  // the key's current canonical label set (hex; "" when empty)
  old_labels: string;
  // +1 to add the label (mint the asset) / -1 to remove it (burn)
  amount: bigint;
};

export type {
  BurnProof,
  LabelAssetProof,
  LegacyHandleProof,
  MintingData,
  OrderProof,
};
