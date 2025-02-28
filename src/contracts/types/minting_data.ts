import { MPTProof } from "./mpt.js";

interface MintingData {
  mpt_root_hash: string;
}

type LegacyHandle = {
  type: "legacy";
  handle_name: string;
};

type NewHandle = {
  type: "new";
  handle_name: string;
};

type Handle = LegacyHandle | NewHandle;

type Proof = {
  mpt_proof: MPTProof;
  handle: Handle;
  amount: bigint;
};

export type { Handle, LegacyHandle, MintingData, NewHandle, Proof };
