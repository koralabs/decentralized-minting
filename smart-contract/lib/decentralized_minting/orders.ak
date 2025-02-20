use aiken/transaction/credential.{Address}

pub type Destination {
  address: Address,
}

pub type OrderDatum {
  // sundae swap multi sig script data
  owner: Data,
  // without asset name
  requested_handle: ByteArray,
  destination: Destination,
}

pub type OrderRedeemer {
  Execute
  Cancel
}
