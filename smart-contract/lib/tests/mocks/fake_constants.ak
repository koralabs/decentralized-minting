use aiken/transaction/credential.{Address}
use aiken/transaction/value.{AssetName, PolicyId}
use common/hashes.{ScriptHash, VerificationKeyHash}

pub const mpt_new_handle_value = "NEW"

pub const mpt_legacy_handle_value = "LEGACY"

// settings & minting_data asset
pub const settings_asset_policy_id: PolicyId =
  #"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"

pub const settings_asset_name: AssetName = "settings_asset"

pub const minting_data_asset_policy_id: PolicyId =
  #"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"

pub const minting_data_asset_name: AssetName = "minting_data_asset"

// settings

pub const mint_governor: ScriptHash = #"0000"

pub const mint_version: Int = 0

// settings v1

pub const new_policy_id: PolicyId =
  #"12345678123456781234567812345678123456781234567812345678"

pub const allowed_minter_0: VerificationKeyHash = #"11112222"

pub const allowed_minter_1: VerificationKeyHash = #"33334444"

pub fn treasury_address() -> Address {
  credential.from_verification_key(#"1111")
    |> credential.with_delegation_key(#"2222")
}

pub const treasury_fee: Int = 2_000_000

pub const minter_fee: Int = 2_000_000

pub fn pz_script_address() -> Address {
  credential.from_verification_key(#"8888")
    |> credential.with_delegation_key(#"9999")
}

pub const order_script_hash: ScriptHash = #"5555"

pub const minting_data_script_hash: ScriptHash = #"3333"
