use cardano/address.{Credential, Script, from_script, from_verification_key}
use cardano/assets as value
use cardano/transaction.{NoDatum, Output}
use decentralized_minting/orders.{OrderDatum}
use sundae/multisig.{Signature}
use tests/mocks/fake_constants.{min_order_lovelace, mint_governor}
use tests/mocks/fake_tx.{
  make_order_input, make_settings_reference_input, make_transaction,
}
use validations/orders/validation.{
  can_cancel_order, can_execute_order, can_refund_order,
}

const owner_vkh = #"01"

fn order_datum() -> OrderDatum {
  OrderDatum {
    owner: Signature(owner_vkh),
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

fn owner_refund_output(lovelace: Int) -> Output {
  Output {
    address: from_verification_key(owner_vkh),
    value: value.from_lovelace(lovelace),
    datum: NoDatum,
    reference_script: None,
  }
}

fn refund_tx(withdrawals: Pairs<Credential, Int>, outputs: List<Output>) {
  let order_input = make_order_input(owner_vkh, "test")
  let tx =
    make_transaction(
      [order_input],
      [make_settings_reference_input()],
      outputs,
      value.zero,
      withdrawals,
      [],
    )
  (tx, order_input.output_reference)
}

// admin-authorized refund returning the order's lovelace to the owner -> ok
test refund_ok() {
  let (tx, order_ref) =
    refund_tx(governor_executed(), [owner_refund_output(min_order_lovelace)])
  can_refund_order(tx, order_ref, order_datum())
}

// refund output exceeding the order lovelace is fine too
test refund_overpay_ok() {
  let (tx, order_ref) =
    refund_tx(
      governor_executed(),
      [owner_refund_output(min_order_lovelace + 1_000_000)],
    )
  can_refund_order(tx, order_ref, order_datum())
}

// no admin withdrawal -> not authorized
test refund_without_admin_fails() fail {
  let (tx, order_ref) = refund_tx([], [owner_refund_output(min_order_lovelace)])
  can_refund_order(tx, order_ref, order_datum())
}

// refund underpays the owner -> rejected
test refund_underpay_rejected() {
  let (tx, order_ref) =
    refund_tx(
      governor_executed(),
      [owner_refund_output(min_order_lovelace - 1)],
    )
  can_refund_order(tx, order_ref, order_datum()) == False
}

// funds go to someone other than the owner -> rejected (can't redirect)
test refund_to_other_rejected() {
  let other =
    Output {
      address: from_verification_key(#"02"),
      value: value.from_lovelace(min_order_lovelace),
      datum: NoDatum,
      reference_script: None,
    }
  let (tx, order_ref) = refund_tx(governor_executed(), [other])
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

// Cancel: only the order's owner (sundae multisig) can reclaim their lovelace — no governor needed,
// and no one else can sign it away.
test order_cancel_requires_owner_signature() {
  let tx = make_transaction([], [], [], value.zero, [], [owner_vkh])
  can_cancel_order(tx, order_datum())
}

test order_cancel_rejects_without_owner_signature_fails() fail {
  let tx = make_transaction([], [], [], value.zero, [], [])
  can_cancel_order(tx, order_datum())
}

// funds sent to a SCRIPT address with the owner's hash bytes -> rejected (wrong cred kind)
test refund_to_script_credential_rejected() {
  let scripted =
    Output {
      address: from_script(owner_vkh),
      value: value.from_lovelace(min_order_lovelace),
      datum: NoDatum,
      reference_script: None,
    }
  let (tx, order_ref) = refund_tx(governor_executed(), [scripted])
  can_refund_order(tx, order_ref, order_datum()) == False
}
