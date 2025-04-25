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

export type { LegacyHandleProof, MintingData };
