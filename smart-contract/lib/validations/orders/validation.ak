use aiken/collection/list
use cardano/address.{VerificationKey}
use cardano/assets as value
use cardano/transaction.{
  InlineDatum, Output, OutputReference, Transaction, find_input,
}
use common/utils.{is_withdrawal_script_executed}
use decentralized_minting/orders.{OrderDatum}
use decentralized_minting/settings.{Settings, find_settings}

// Order-spend validation, extracted from the `demiord` validator so each redeemer's logic is
// unit-testable (mirrors the minting_data `can_*` pattern). The compiled logic is unchanged.

// Execute: fulfillment via a mint — gated on the `mint_governor` withdrawal script executing.
pub fn can_execute_order(transaction: Transaction) -> Bool {
  let Transaction { reference_inputs, withdrawals, .. } = transaction
  let Settings { mint_governor, .. } = find_settings(reference_inputs)
  is_withdrawal_script_executed(withdrawals, mint_governor)
}

// Cancel: only the order's owner (via sundae multisig) can reclaim their lovelace.
pub fn can_cancel_order(transaction: Transaction, datum: OrderDatum) -> Bool {
  let Transaction { extra_signatories, .. } = transaction
  // owner is stored as a raw payment key hash (the off-chain order builder writes the
  // ordering wallet's key hash, not a MultisigScript). A single-sig owner reclaims by signing.
  expect owner_key_hash: ByteArray = datum.owner
  list.has(extra_signatories, owner_key_hash)
}

// WS8 — admin refund that can't steal. Authorized by the same `mint_governor` as `Execute`,
// but the order's lovelace must be returned to the owner's payment credential, so an operator
// can clear a stuck/unfulfillable order yet can only ever send the money back to the party that
// controls it. Owner must be a single-signature multisig (the common case); complex-multisig
// owners still use `Cancel`.
pub fn can_refund_order(
  transaction: Transaction,
  order_output_reference: OutputReference,
  datum: OrderDatum,
) -> Bool {
  let Transaction { inputs, reference_inputs, outputs, withdrawals, .. } =
    transaction

  // admin authorization (same source Execute uses)
  let Settings { mint_governor, .. } = find_settings(reference_inputs)
  expect is_withdrawal_script_executed(withdrawals, mint_governor)

  // owner's payment key hash — raw bytes (matches the off-chain order builder)
  expect owner_key_hash: ByteArray = datum.owner

  // the order UTxO being spent -> its lovelace must be returned
  expect Some(order_input) = find_input(inputs, order_output_reference)
  let order_lovelace = value.lovelace_of(order_input.output.value)

  // Bind each refund to a DISTINCT output: the paying output must carry THIS order's
  // OutputReference as its inline datum. One output can satisfy exactly one order, so an
  // admin can no longer refund N same-owner orders against a single owner-output and pocket
  // the difference (the double-satisfaction the old `list.any` allowed).
  let order_ref_data: Data = order_output_reference
  list.any(
    outputs,
    fn(output) {
      let Output { address, value: output_value, datum: output_datum, .. } =
        output
      when (address.payment_credential, output_datum) is {
        (VerificationKey(vkh), InlineDatum(tag)) -> and {
            vkh == owner_key_hash,
            value.lovelace_of(output_value) >= order_lovelace,
            tag == order_ref_data,
          }
        _ -> False
      }
    },
  )
}
