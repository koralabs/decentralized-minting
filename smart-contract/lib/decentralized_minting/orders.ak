use aiken/transaction/credential.{Address}
use decentralized_minting/discount.{DiscountClaim}

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
  // WS5: optional minting-discount claim (which class + the referenced qualifying asset).
  // None = full price. Appended last to keep the prefix decode stable.
  discount_claim: Option<DiscountClaim>,
  // Subhandle mint kind, so the engine knows whether to mint a virtual (000) or
  // an NFT (100/222) subhandle. 0 = root / NFT subhandle, 1 = virtual subhandle.
  // Appended last. Decoded by every validator that parses OrderDatum (demiord
  // spend + minting_data's all_orders_are_satisfied) — both ignore the value
  // today; mint correctness is still enforced by the per-handle proof's
  // is_virtual. Carried here so type is unambiguous on-chain at order time.
  is_virtual: Int,
}

pub type OrderRedeemer {
  Execute
  Cancel
  // WS8: admin/operator refund of an unfulfillable order. Authorized by the same
  // `mint_governor` as `Execute`, but gated on returning the order's lovelace to the
  // owner — so an admin can clear any stuck order yet can never redirect the funds.
  Refund
}
