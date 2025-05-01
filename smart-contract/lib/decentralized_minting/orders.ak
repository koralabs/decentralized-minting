use aiken/transaction/credential.{Address}

// OrderDatum now consists of owner (to close order), 
// requested_handle (handle name - any string)
// and destination_address (for now it is address)
// 
// TODO:
// In order datum, will have info for what kinda handle they mint (subhandle, root handle, ...)
// Using this information, validator can calculate handle's price

pub type OrderDatum {
  // the key hash of the wallet that placed the order that is used for cancelling the order
  owner: Data,
  // without asset name label
  requested_handle: ByteArray,
  // the payment credential in the address that the Handle should be sent to
  destination_address: Address,
}

pub type OrderRedeemer {
  Execute
  Cancel
  Refund
}
