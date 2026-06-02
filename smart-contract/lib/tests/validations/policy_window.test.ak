use aiken/bytearray
use aiken/interval
use aiken/transaction.{InlineDatum, Input, Output, OutputReference, TransactionId}
use aiken/transaction/credential.{from_verification_key}
use aiken/transaction/value
use common/cip68.{prefix_100}
use validations/policy_window.{assert_mint_within_policy_window}

const admin_policy = #"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"

// gate the legacy policy itself (the cutover case)
const mint_policy = #"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"

const anchor_slot = 4492800

const anchor_time = 1596059091000

const slot_ms = 1000

fn policies_ref_input(
  listed_policy: ByteArray,
  window: (Int, Int, Int),
) -> Input {
  let asset_name = bytearray.concat(prefix_100, "handle_policies")
  let datum_value: List<Pairs<ByteArray, (Int, Int, Int)>> =
    [[Pair(listed_policy, window)]]
  Input {
    output_reference: OutputReference {
      transaction_id: TransactionId { hash: #"bbbb" },
      output_index: 0,
    },
    output: Output {
      address: from_verification_key(#"00"),
      value: value.zero() |> value.add(admin_policy, asset_name, 1),
      datum: InlineDatum(datum_value),
      reference_script: None,
    },
  }
}

fn gate(ref_inputs: List<Input>, valid_to: Int) -> Bool {
  assert_mint_within_policy_window(
    ref_inputs,
    admin_policy,
    mint_policy,
    interval.before(valid_to),
    anchor_slot,
    anchor_time,
    slot_ms,
  )
}

// all window slots 0 -> dormant -> allowed regardless of validity bound
test dormant_window_allows() {
  gate([policies_ref_input(mint_policy, (0, 0, 0))], anchor_time + 9_000_000)
}

// sunset slot anchor+1000 -> posix anchor_time+1_000_000; tx valid-to before it -> allowed
test before_sunset_allows() {
  gate(
    [policies_ref_input(mint_policy, (anchor_slot, 0, anchor_slot + 1000))],
    anchor_time + 500_000,
  )
}

// tx valid-to AT/after the converted sunset -> rejected (exclusive)
test at_sunset_rejected() {
  gate(
    [policies_ref_input(mint_policy, (anchor_slot, 0, anchor_slot + 1000))],
    anchor_time + 1_000_000,
  ) == False
}

// no $handle_policies ref input -> unrestricted (dormant default)
test no_ref_input_allows() {
  gate([], anchor_time + 9_000_000)
}

// ref input lists a DIFFERENT policy -> the mint policy isn't gated, even past that sunset
test policy_not_listed_allows() {
  gate(
    [policies_ref_input(#"deadbeef", (anchor_slot, 0, anchor_slot + 1))],
    anchor_time + 9_000_000,
  )
}
