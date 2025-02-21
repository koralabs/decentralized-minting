import { MPTProof } from "./mpf.js";

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
  amount: number;
};

export type { Handle, LegacyHandle, NewHandle, Proof };
