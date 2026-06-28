use cardano/address.{Credential, Script, from_script, from_verification_key}
use cardano/assets as value
use cardano/transaction.{InlineDatum, NoDatum, Output, OutputReference}
use decentralized_minting/orders.{OrderDatum}
use tests/mocks/fake_constants.{min_order_lovelace, mint_governor}
use tests/mocks/fake_tx.{
  make_order_input, make_settings_reference_input, make_transaction,
}
use validations/orders/validation.{
  can_cancel_order, can_execute_order, can_refund_order,
}

const owner_vkh = #"01"

// owner is a RAW payment key hash (matches the off-chain order builder), not a MultisigScript.
fn order_datum() -> OrderDatum {
  OrderDatum {
    owner: owner_vkh,
    requested_handle: "test",
    destination_address: from_verification_key(owner_vkh),
    discount_claim: None,
    is_virtual: 0,
  }
}

// withdrawal map with the mint_governor executed (admin authorization present)
fn governor_executed() -> Pairs<Credential, Int> {
  [Pair(Script(mint_governor), 0)]
}

// a refund output to the owner, tagged with the order's OutputReference — the binding the
// validator now requires so a single output can't satisfy two different refunds.
fn owner_refund_output(lovelace: Int, tag: OutputReference) -> Output {
  Output {
    address: from_verification_key(owner_vkh),
    value: value.from_lovelace(lovelace),
    datum: InlineDatum(tag),
    reference_script: None,
  }
}

// build a refund tx; outputs are produced from the order's ref so tests can tag correctly.
fn refund_tx(
  withdrawals: Pairs<Credential, Int>,
  build_outputs: fn(OutputReference) -> List<Output>,
) {
  let order_input = make_order_input(owner_vkh, "test")
  let order_ref = order_input.output_reference
  let tx =
    make_transaction(
      [order_input],
      [make_settings_reference_input()],
      build_outputs(order_ref),
      value.zero,
      withdrawals,
      [],
    )
  (tx, order_ref)
}

// admin-authorized refund, owner-output tagged with the order ref -> ok
test refund_ok() {
  let (tx, order_ref) =
    refund_tx(
      governor_executed(),
      fn(r) { [owner_refund_output(min_order_lovelace, r)] },
    )
  can_refund_order(tx, order_ref, order_datum())
}

// refund output exceeding the order lovelace is fine too
test refund_overpay_ok() {
  let (tx, order_ref) =
    refund_tx(
      governor_executed(),
      fn(r) { [owner_refund_output(min_order_lovelace + 1_000_000, r)] },
    )
  can_refund_order(tx, order_ref, order_datum())
}

// no admin withdrawal -> not authorized
test refund_without_admin_fails() fail {
  let (tx, order_ref) =
    refund_tx([], fn(r) { [owner_refund_output(min_order_lovelace, r)] })
  can_refund_order(tx, order_ref, order_datum())
}

// refund underpays the owner -> rejected
test refund_underpay_rejected() {
  let (tx, order_ref) =
    refund_tx(
      governor_executed(),
      fn(r) { [owner_refund_output(min_order_lovelace - 1, r)] },
    )
  can_refund_order(tx, order_ref, order_datum()) == False
}

// funds go to someone other than the owner -> rejected (can't redirect)
test refund_to_other_rejected() {
  let (tx, order_ref) =
    refund_tx(
      governor_executed(),
      fn(r) {
        [
          Output {
            address: from_verification_key(#"02"),
            value: value.from_lovelace(min_order_lovelace),
            datum: InlineDatum(r),
            reference_script: None,
          },
        ]
      },
    )
  can_refund_order(tx, order_ref, order_datum()) == False
}

// funds sent to a SCRIPT address with the owner's hash bytes -> rejected (wrong cred kind)
test refund_to_script_credential_rejected() {
  let (tx, order_ref) =
    refund_tx(
      governor_executed(),
      fn(r) {
        [
          Output {
            address: from_script(owner_vkh),
            value: value.from_lovelace(min_order_lovelace),
            datum: InlineDatum(r),
            reference_script: None,
          },
        ]
      },
    )
  can_refund_order(tx, order_ref, order_datum()) == False
}

// #5c double-satisfaction: an owner-output with NO order-ref tag can't satisfy the refund —
// this is exactly the loophole the old `list.any` left open (one untagged output, many orders).
test refund_untagged_rejected() {
  let (tx, order_ref) =
    refund_tx(
      governor_executed(),
      fn(_r) {
        [
          Output {
            address: from_verification_key(owner_vkh),
            value: value.from_lovelace(min_order_lovelace),
            datum: NoDatum,
            reference_script: None,
          },
        ]
      },
    )
  can_refund_order(tx, order_ref, order_datum()) == False
}

// #5c double-satisfaction: an owner-output tagged with a DIFFERENT order's ref can't be
// reused to satisfy THIS order -> two orders can never share one refund output.
test refund_wrong_tag_rejected() {
  let other_ref = OutputReference { transaction_id: #"bbbb", output_index: 0 }
  let (tx, order_ref) =
    refund_tx(
      governor_executed(),
      fn(_r) { [owner_refund_output(min_order_lovelace, other_ref)] },
    )
  can_refund_order(tx, order_ref, order_datum()) == False
}

// Execute: fulfillment (via the batched mint) is gated on the mint_governor withdrawal firing.
test order_execute_requires_governor_withdrawal() {
  let tx =
    make_transaction(
      [],
      [make_settings_reference_input()],
      [],
      value.zero,
      governor_executed(),
      [],
    )
  can_execute_order(tx)
}

test order_execute_rejects_without_governor_fails() fail {
  let tx =
    make_transaction([], [make_settings_reference_input()], [], value.zero, [], [])
  can_execute_order(tx)
}

// Cancel: the order's owner (raw key hash) must sign — no governor needed.
test order_cancel_requires_owner_signature() {
  let tx = make_transaction([], [], [], value.zero, [], [owner_vkh])
  can_cancel_order(tx, order_datum())
}

test order_cancel_rejects_without_owner_signature_fails() fail {
  let tx = make_transaction([], [], [], value.zero, [], [])
  can_cancel_order(tx, order_datum())
}
