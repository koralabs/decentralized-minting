import { MPTProof } from "./mpt.js";

interface MintingData {
  mpt_root_hash: string;
}

// WS5 free-virtual — for a PRIVATE virtual sub mint/burn: the data to bump the root's
// private-virtual counter (mirrors validations/minting_data/types.FreeVirtualData).
type FreeVirtualData = {
  root_proof: MPTProof;
  root_pre_count: bigint;
  root_labels: string; // hex; the root's current label set (preserved)
};

type LegacyHandleProof = {
  mpt_proof: MPTProof;
  // handle name as hex format without asset name label
  handle_name: string;
  // whether it's virtual handle or not (1 or 0)
  is_virtual: bigint;
  // Some for a PRIVATE virtual sub (root counter update), undefined => None
  free_virtual?: FreeVirtualData;
};

// WS1 — label-asset registry proof (one per 001/002/… label asset minted/burned).
// Mirrors the on-chain `validations/minting_data/types.LabelAssetProof`.
type LabelAssetProof = {
  mpt_proof: MPTProof;
  // root handle name as hex (the MPT key)
  handle_name: string;
  // 4-byte CIP-67 label prefix being added (+1) / removed (-1), hex
  label: string;
  // the key's current private-virtual counter (preserved across the label change)
  old_free_virtual_count: bigint;
  // the key's current canonical label set (hex; "" when empty)
  old_labels: string;
  // +1 to add the label (mint the asset) / -1 to remove it (burn)
  amount: bigint;
};

export type { FreeVirtualData, LabelAssetProof, LegacyHandleProof, MintingData };
