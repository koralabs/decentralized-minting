use aiken/transaction/credential.{Address,
  Credential, VerificationKeyCredential}
use aiken/transaction/value
use tests/mocks/fake_tx.{make_output}
use validations/minting_data/utils.{add_owner_fee, owner_fees_all_paid}

// Two distinct subhandle owners.
fn owner_a() -> Credential {
  VerificationKeyCredential(#"aa")
}

fn owner_b() -> Credential {
  VerificationKeyCredential(#"bb")
}

fn addr(cred: Credential) -> Address {
  Address { payment_credential: cred, stake_credential: None }
}

// --- add_owner_fee: merge / keep-distinct / drop-zero ---

test add_owner_fee_merges_same_owner() {
  let fees = add_owner_fee(add_owner_fee([], owner_a(), 10), owner_a(), 5)
  fees == [(owner_a(), 15)]
}

test add_owner_fee_keeps_distinct_owners() {
  let fees = add_owner_fee(add_owner_fee([], owner_a(), 10), owner_b(), 5)
  fees == [(owner_a(), 10), (owner_b(), 5)]
}

test add_owner_fee_drops_zero_and_negative() {
  add_owner_fee([], owner_a(), 0) == [] && add_owner_fee([], owner_a(), -1) == []
}

// --- owner_fees_all_paid: the double-satisfaction defenses ---

// Two subhandles for the SAME owner merge into one 20 requirement. A single 10 output (i.e. paying
// for "one" of them) must NOT satisfy both — only a single output >= the merged 20 does. This is the
// core defense: you can't fulfil two owner obligations with one undersized payment.
test owner_fees_merge_blocks_double_satisfaction() {
  let fees = add_owner_fee(add_owner_fee([], owner_a(), 10), owner_a(), 10)
  let paid_once =
    [make_output(addr(owner_a()), value.from_lovelace(10))]
  let paid_full =
    [make_output(addr(owner_a()), value.from_lovelace(20))]
  !owner_fees_all_paid(fees, paid_once) && owner_fees_all_paid(fees, paid_full)
}

// Two DISTINCT owners each owed 10 need two separate outputs — one 10 output to owner A cannot also
// count as owner B's payment.
test owner_fees_distinct_owners_need_separate_outputs() {
  let fees = add_owner_fee(add_owner_fee([], owner_a(), 10), owner_b(), 10)
  let only_a =
    [make_output(addr(owner_a()), value.from_lovelace(10))]
  let both =
    [
      make_output(addr(owner_a()), value.from_lovelace(10)),
      make_output(addr(owner_b()), value.from_lovelace(10)),
    ]
  !owner_fees_all_paid(fees, only_a) && owner_fees_all_paid(fees, both)
}

// Over-payment is fine (the check is >=), and an empty owner-fee list is trivially satisfied.
test owner_fees_overpay_ok_and_empty_trivial() {
  let fees = add_owner_fee([], owner_a(), 10)
  let overpaid =
    [make_output(addr(owner_a()), value.from_lovelace(25))]
  owner_fees_all_paid(fees, overpaid) && owner_fees_all_paid([], [])
}
