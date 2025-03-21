import { MPTProof } from "./mpt.js";

interface MintingData {
  mpt_root_hash: string;
}

// NOTE:
// handle_name is in hex format (ByteArray - without asset name label)
//
type Handle =
  | {
      handle_name: string;
      is_virtual: boolean;
    }
  | string;

type Proof = {
  mpt_proof: MPTProof;
  handle_name: string;
  is_virtual: boolean;
  amount: bigint;
};

export type { Handle, MintingData, Proof };
