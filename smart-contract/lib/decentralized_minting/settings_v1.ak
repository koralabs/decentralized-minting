use aiken/transaction/credential.{Address}
use aiken/transaction/value.{PolicyId}
use common/hashes.{ScriptHash, VerificationKeyHash}

pub type SettingsV1 {
  policy_id: PolicyId,
  allowed_minters: List<VerificationKeyHash>,
  treasury_address: Address,
  treasury_fee: Int,
  minter_fee: Int,
  // minting data proxy validator's hash
  minting_data_governor: ScriptHash,
}
