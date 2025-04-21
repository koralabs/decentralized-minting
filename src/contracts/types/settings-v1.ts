import { Address } from "@helios-lang/ledger";

interface SettingsV1 {
  policy_id: string;
  // anyone who buy minting credit will be listed here
  allowed_minters: string[];
  treasury_address: Address;
  treasury_fee: bigint;
  minter_fee: bigint;
  // personalization script where ref asset is sent
  pz_script_address: Address;
  // user makes an order (as UTxO) in order script
  order_script_hash: string;
  // minting data script is used to check
  // all minting handles logic (for both new and legacy)
  // minting_data_asset is locked inside that script
  minting_data_script_hash: string;
  // valid handle price assets
  // only handle price info attached with these assets
  // are valid
  // list of asset ids
  valid_handle_price_assets: string[];
}

export type { SettingsV1 };
