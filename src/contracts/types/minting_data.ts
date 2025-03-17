import { MPTProof } from "./mpt.js";

interface MintingData {
  mpt_root_hash: string;
}

// NOTE:
// handle_name is in hex format (ByteArray - without asset name label)
//
type LegacyHandle = {
  type: "legacy";
  legacy_handle_name: string;
};

type LegacySubHandle = {
  type: "legacy_sub";
  legacy_sub_handle_name: string;
  legacy_root_handle_name: string;
};

type LegacyVirtualSubHandle = {
  type: "legacy_virtual_sub";
  legacy_virtual_sub_handle_name: string;
  legacy_root_handle_name: string;
};

type NewHandle = {
  type: "new";
  new_handle_name: string;
};

type Handle =
  | LegacyHandle
  | LegacySubHandle
  | LegacyVirtualSubHandle
  | NewHandle;

type Proof = {
  mpt_proof: MPTProof;
  handle: Handle;
  amount: bigint;
};

export type {
  Handle,
  LegacyHandle,
  LegacySubHandle,
  LegacyVirtualSubHandle,
  MintingData,
  NewHandle,
  Proof,
};
