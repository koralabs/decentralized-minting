use aiken/transaction.{NoDatum, Output}
use aiken/transaction/credential.{
  Inline, ScriptCredential, StakeCredential, from_script, from_verification_key,
}
use aiken/transaction/value
use decentralized_minting/orders.{OrderDatum}
use sundae/multisig.{Signature}
use tests/mocks/fake_constants.{min_order_lovelace, mint_governor}
use tests/mocks/fake_tx.{
  make_order_input, make_settings_reference_input, make_transaction,
}
use validations/orders/validation.{can_refund_order}

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
fn governor_executed() -> Pairs<StakeCredential, Int> {
  [Pair(Inline(ScriptCredential(mint_governor)), 0)]
}

fn owner_refund_output(lovelace: Int) -> Output {
  Output {
    address: from_verification_key(owner_vkh),
    value: value.from_lovelace(lovelace),
    datum: NoDatum,
    reference_script: None,
  }
}

fn refund_tx(withdrawals: Pairs<StakeCredential, Int>, outputs: List<Output>) {
  let order_input = make_order_input(owner_vkh, "test")
  let tx =
    make_transaction(
      [order_input],
      [make_settings_reference_input()],
      outputs,
      value.zero(),
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
