import { Address } from "@helios-lang/ledger";

interface SettingsV1 {
  policy_id: string;
  // anyone who buy minting credit will be listed here
  allowed_minters: string[];
  treasury_address: Address;
  treasury_fee: bigint;
  minter_fee: bigint;
  // user makes an order (as UTxO) in order script
  order_script_hash: string;
  // minting data script is used to check
  // mpt root hash is correctly updated
  // minting_data_asset is locked inside that sccript
  minting_data_script_hash: string;
}

export type { SettingsV1 };
