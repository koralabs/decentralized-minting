use aiken/transaction/credential.{Address}

pub type Destination {
  address: Address,
}

// OrderDatum now consists of owner (to close order), 
// requested_handle (handle name - any string)
// and destination (for now it is address)
// 
// TODO:
// In order datum, will have info for what kinda handle they mint (subhandle, root handle, ...)
// Using this information, validator can calculate handle's price

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
