use aiken/hash.{Blake2b_224, Hash}
use aiken/transaction.{Datum}
use aiken/transaction/credential.{Address, VerificationKey}

pub type Settings {
  settings_governor: ByteArray,
  mint_governor: ByteArray,
  data: Data,
}

pub type SettingsV1 {
  policy_id: ByteArray,
  all_handles: ByteArray,
  allowed_minters: List<Hash<Blake2b_224, VerificationKey>>,
  treasury_address: Address,
  treasury_fee: Int,
  minter_fee: Int,
}

pub type Destination {
  address: Address,
  datum: Datum,
}

pub type OrderDatum {
  owner: Data,
  requested_handle: ByteArray,
  destination: Destination,
}

pub type OrderRedeemer {
  Execute
  Cancel
}
