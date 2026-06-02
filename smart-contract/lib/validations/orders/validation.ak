use aiken/list
use aiken/transaction.{Output, OutputReference, Transaction, find_input}
use aiken/transaction/credential.{VerificationKeyCredential}
use aiken/transaction/value
use common/utils.{is_withdrawal_script_executed}
use decentralized_minting/orders.{OrderDatum}
use decentralized_minting/settings.{Settings, find_settings}
use sundae/multisig

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
  let Transaction { extra_signatories, validity_range, withdrawals, .. } =
    transaction
  expect owner: multisig.MultisigScript = datum.owner
  multisig.satisfied(owner, extra_signatories, validity_range, withdrawals)
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

  // owner's payment key hash (single-signature owners only)
  expect owner: multisig.MultisigScript = datum.owner
  expect multisig.Signature { key_hash: owner_key_hash } = owner

  // the order UTxO being spent -> its lovelace must be returned
  expect Some(order_input) = find_input(inputs, order_output_reference)
  let order_lovelace = value.lovelace_of(order_input.output.value)

  // some output pays >= the order lovelace back to the owner's payment credential
  list.any(
    outputs,
    fn(output) {
      let Output { address, value: output_value, .. } = output
      when address.payment_credential is {
        VerificationKeyCredential(vkh) -> and {
            vkh == owner_key_hash,
            value.lovelace_of(output_value) >= order_lovelace,
          }
        _ -> False
      }
    },
  )
}
