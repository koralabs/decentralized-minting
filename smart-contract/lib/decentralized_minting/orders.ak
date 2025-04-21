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
  // the key hash of the wallet that placed the order that is used for cancelling the order
  owner: Data,
  // without asset label
  requested_handle: ByteArray,
  // the payment credential in the address that the Handle should be sent to
  destination: Destination,
  // whether order for legacy handle or not (1: legacy handle, 0: new handle)
  is_legacy: Int,
  // whether order for virtual sub handle or not (1: virtual, 0: not)
  is_virtual: Int,
}

pub type OrderRedeemer {
  Execute
  Cancel
}
