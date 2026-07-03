use aiken/interval.{Interval}
use aiken/primitive/bytearray
use cardano/assets.{PolicyId, quantity_of}
use cardano/transaction.{InlineDatum, Input, Output}
use common/cip68.{prefix_222}
use decentralized_minting/handle_policies.{
  find_policy_window, mint_allowed_in_window, window_to_posix,
}

// $handle_policies admin handle name (api.handle.me `HANDLE_POLICIES_NAME`).
const handle_policies_name: ByteArray = "handle_policies"

// WS7 — gate a mint under `mint_policy_id` on its `$handle_policies` minting window.
//
// The admin datum is read from a reference input: the `$handle_policies` handle's owner
// (222) token, held under `admin_policy_id` (the legacy policy that carries the admin handles).
// The registry `List<Pairs>` datum lives on the 222 token, not the CIP-68 100 reference token
// (which carries standard handle metadata).
// The window slots are converted to the POSIX-ms domain of the tx validity range via the
// network slot anchor (the validator's compile-time params), then the tx validity upper bound
// must fall inside the window.
//
// FAIL-CLOSED (hardened 2026-07-02 — was fail-open, which left last_mint_slot unenforced so a
// "passing" mint proved nothing about the window):
//   - ref input absent / no inline datum -> FAIL (the $handle_policies ref input is REQUIRED)
//   - mint policy not listed in the datum -> FAIL (only registered handle policies may mint)
//   - all window slots 0 for a listed policy -> allowed (explicit "no bound set yet")
// The engine attaches the $handle_policies 222 owner-token ref input + a bounded validity range on
// every mint; an unbounded validity can't prove it lands before last_minting_slot/sunset.
pub fn assert_mint_within_policy_window(
  reference_inputs: List<Input>,
  admin_policy_id: PolicyId,
  mint_policy_id: PolicyId,
  validity_range: Interval<Int>,
  anchor_slot: Int,
  anchor_time_ms: Int,
  slot_length_ms: Int,
) -> Bool {
  let policies_asset_name = bytearray.concat(prefix_222, handle_policies_name)
  when
    find_handle_policies_datum(
      reference_inputs,
      admin_policy_id,
      policies_asset_name,
    )
  is {
    None ->
      fail @"$handle_policies reference input with inline datum is required"
    Some(datum) ->
      when find_policy_window(datum, mint_policy_id) is {
        None -> fail @"mint policy is not registered in $handle_policies"
        Some(window) ->
          mint_allowed_in_window(
            window_to_posix(window, anchor_slot, anchor_time_ms, slot_length_ms),
            validity_range,
          )
      }
  }
}

// Locate the `$handle_policies` reference input (its 100 token under `policy_id`) and return
// its inline datum, if present.
fn find_handle_policies_datum(
  reference_inputs: List<Input>,
  policy_id: PolicyId,
  asset_name: ByteArray,
) -> Option<Data> {
  when reference_inputs is {
    [] -> None
    [ref_input, ..rest] -> {
      let Input { output: Output { value: ref_value, datum, .. }, .. } = ref_input
      if quantity_of(ref_value, policy_id, asset_name) >= 1 {
        when datum is {
          InlineDatum(d) -> Some(d)
          _ -> None
        }
      } else {
        find_handle_policies_datum(rest, policy_id, asset_name)
      }
    }
  }
}
