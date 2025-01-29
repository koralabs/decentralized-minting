import { Address } from "@helios-lang/ledger";

interface SettingsV1 {
  policy_id: string;
  all_handles: string; // MPT root hash
  allowed_minters: string[]; // PubKeyHashes
  treasury_address: Address;
  treasury_fee: bigint;
  minter_fee: bigint;
}

export type { SettingsV1 };
