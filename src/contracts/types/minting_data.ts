import { MPTProof } from "./mpt.js";

interface MintingData {
  mpt_root_hash: string;
}

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
  // the key's current canonical label-set value (hex; "" when empty)
  old_value: string;
  // +1 to add the label (mint the asset) / -1 to remove it (burn)
  amount: bigint;
};

export type { LabelAssetProof, LegacyHandleProof, MintingData };
