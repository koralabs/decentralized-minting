import { Address } from "@helios-lang/ledger";

interface SettingsV1 {
  policy_id: string;
  // anyone who buy minting credit will be listed here
  allowed_minters: string[];
  // valid handle price assets (it is mapped 1:1 with allowed_minters)
  // only handle price info attached with these assets
  // are valid
  // list of (policy_id, asset_name)
  valid_handle_price_assets: string[];
  // treasury fee percentage * total handle price will go to this address
  treasury_address: Address;
  // treasury fee percentage (0-100)
  treasury_fee_percentage: bigint;
  // personalization script where ref asset is sent
  pz_script_address: Address;
  // user makes an order (as UTxO) in order script
  order_script_hash: string;
  // minting data script is used to check
  // all minting handles logic (for both new and legacy)
  // minting_data_asset is locked inside that script
  minting_data_script_hash: string;
}

export type { SettingsV1 };
