use aiken/list
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{AssetName, PolicyId}
use common/hashes.{ScriptHash, VerificationKeyHash}

// constants
pub const min_treasury_fee: Int = 2_000_000

pub type SettingsV1 {
  policy_id: PolicyId,
  // anyone who buy minting credit will be listed here
  allowed_minters: List<VerificationKeyHash>,
  // valid handle price assets (it is mapped 1:1 with allowed_minters)
  // only handle price info attached with these assets
  // are valid
  // list of (policy_id, asset_name)
  valid_handle_price_assets: List<(PolicyId, AssetName)>,
  // treasury fee percentage * total handle price will go to this address
  treasury_address: Address,
  // treasury fee percentage (0-100)
  treasury_fee_percentage: Int,
  // personalization script where ref asset is sent
  pz_script_address: Address,
  // user makes an order (as UTxO) in order script
  order_script_hash: ScriptHash,
  // minting data script is used to check
  // all minting handles logic (for both new and legacy)
  // minting_data_asset is locked inside that script
  minting_data_script_hash: ScriptHash,
}

//
// NOTE:
// When mint new handles
// Collect orders from order script
// minting data asset must be spent from minting data script
//
// treasury fee: Math.max(total_handles_price * treasury_fee_percentage / 100n, min_treasury_fee)
// minter fee: total_handles_price - treasury_fee

pub fn get_allowed_minter_and_valid_handle_price_asset(
  allowed_minters: List<VerificationKeyHash>,
  valid_handle_price_assets: List<(PolicyId, AssetName)>,
  minter_index: Int,
) -> (VerificationKeyHash, (PolicyId, AssetName)) {
  expect Some(allowed_minter) = list.at(allowed_minters, minter_index)
  expect Some(valid_handle_price_asset) =
    list.at(valid_handle_price_assets, minter_index)
  (allowed_minter, valid_handle_price_asset)
}
