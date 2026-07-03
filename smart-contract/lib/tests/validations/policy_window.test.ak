use aiken/interval
use aiken/primitive/bytearray
use cardano/address.{from_verification_key}
use cardano/assets as value
use cardano/transaction.{InlineDatum, Input, NoDatum, Output, OutputReference}
use common/cip68.{prefix_222}
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
  let asset_name = bytearray.concat(prefix_222, "handle_policies")
  let datum_value: List<Pairs<ByteArray, (Int, Int, Int)>> =
    [[Pair(listed_policy, window)]]
  Input {
    output_reference: OutputReference {
      transaction_id: #"bbbb",
      output_index: 0,
    },
    output: Output {
      address: from_verification_key(#"00"),
      value: value.zero |> value.add(admin_policy, asset_name, 1),
      datum: InlineDatum(datum_value),
      reference_script: None,
    },
  }
}

// Same token but NO inline datum (a plain-held 222 with no registry datum attached).
fn policies_ref_input_no_datum() -> Input {
  let asset_name = bytearray.concat(prefix_222, "handle_policies")
  Input {
    output_reference: OutputReference {
      transaction_id: #"bbbb",
      output_index: 0,
    },
    output: Output {
      address: from_verification_key(#"00"),
      value: value.zero |> value.add(admin_policy, asset_name, 1),
      datum: NoDatum,
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

// last_minting_slot is INCLUSIVE: a mint whose validity upper bound == last is ALLOWED.
test at_last_mint_slot_allowed() {
  gate(
    [policies_ref_input(mint_policy, (0, anchor_slot + 1000, 0))],
    anchor_time + 1_000_000,
  )
}

// one ms past last_minting_slot -> rejected (no mints after last_mint_slot).
test after_last_mint_slot_rejected() {
  gate(
    [policies_ref_input(mint_policy, (0, anchor_slot + 1000, 0))],
    anchor_time + 1_000_001,
  ) == False
}

// FAIL-CLOSED: no $handle_policies ref input -> the gate REJECTS (was: unrestricted).
test no_ref_input_rejected() fail {
  gate([], anchor_time + 9_000_000)
}

// FAIL-CLOSED: ref input carries the token but NO inline datum -> REJECTS.
test no_datum_rejected() fail {
  gate([policies_ref_input_no_datum()], anchor_time + 9_000_000)
}

// FAIL-CLOSED: the mint policy is NOT listed in the registry -> REJECTS (was: unrestricted).
test policy_not_listed_rejected() fail {
  gate(
    [policies_ref_input(#"deadbeef", (anchor_slot, 0, anchor_slot + 1))],
    anchor_time + 9_000_000,
  )
}
