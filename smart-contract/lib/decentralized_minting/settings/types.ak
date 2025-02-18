use aiken/hash.{Blake2b_224, Hash}
use aiken/transaction/credential.{Address, VerificationKey}

pub type Settings {
  mint_governor: ByteArray,
  // setting v1 data
  data: Data,
}

pub type SettingsV1 {
  policy_id: ByteArray,
  allowed_minters: List<Hash<Blake2b_224, VerificationKey>>,
  treasury_address: Address,
  treasury_fee: Int,
  minter_fee: Int,
}
