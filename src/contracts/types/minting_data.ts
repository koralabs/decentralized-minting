import { MPTProof } from "./mpt.js";

interface MintingData {
  mpt_root_hash: string;
}

type Proof = {
  mpt_proof: MPTProof;
  root_handle_settings_index: bigint;
};

export type { MintingData, Proof };
