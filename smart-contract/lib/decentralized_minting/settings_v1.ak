use aiken/transaction/credential.{Address}
use aiken/transaction/value.{PolicyId}
use common/hashes.{ScriptHash, VerificationKeyHash}

pub type SettingsV1 {
  policy_id: PolicyId,
  // anyone who buy minting credit will be listed here
  allowed_minters: List<VerificationKeyHash>,
  treasury_address: Address,
  treasury_fee: Int,
  minter_fee: Int,
  // user makes an order (as UTxO) in order script
  order_script_hash: ScriptHash,
  // minting data script is used to check
  // mpt root hash is correctly updated
  // minting_data_asset is locked inside that sccript
  minting_data_script_hash: ScriptHash,
}
//
// NOTE:
// When mint new handles
// Collect orders from order script
// minting data asset must be spent from minting data script
