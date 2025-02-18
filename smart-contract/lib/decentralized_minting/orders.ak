use aiken/transaction.{Datum}
use aiken/transaction/credential.{Address}

pub type Destination {
  address: Address,
  // handle's datum
  datum: Datum,
}

pub type OrderDatum {
  // sundae swap multi sig script data
  owner: Data,
  requested_handle: ByteArray,
  destination: Destination,
}

pub type OrderRedeemer {
  Execute
  Cancel
}
