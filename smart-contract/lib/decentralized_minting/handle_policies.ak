use aiken/collection/pairs
use aiken/interval.{Finite, Interval, IntervalBound}
use cardano/assets.{PolicyId}

// WS7 — sunset / minting-window enforcement against the `$handle_policies` admin datum.
//
// `$handle_policies` (read by api.handle.me, `utils/policies.ts`) maps each policy id to a
// window `(first_minting_slot, last_minting_slot, sunset_slot)`; `0` means "unset / no bound".
// The legacy sunset is the cutover trigger: before it, DeMi mints under the legacy policy;
// at/after it, only under the new policy (whose own window bounds it). Nothing sunsets in the
// near term — slots stay `0` (open) until Kora writes them after DeMi reaches parity.
//
// This module is the *verifiable core*: the pure window check + the validity-bound extractor.
//
// ACTIVATION DEPENDENCIES (deliberately not wired into the mint validators yet — both need a
// real on-chain artifact / infra decision that doesn't exist in-repo, and activation is a
// post-parity step):
//   1. The exact Plutus Data encoding of the `$handle_policies` datum (no on-chain writer or
//      example exists in these repos; the api route test mocks the decoder). The reference-input
//      read + `expect`-decode must be pinned against a real datum first.
//   2. Slot↔time: tx `validity_range` is exposed to Plutus as POSIX time, while the policy
//      bounds are absolute slot numbers. The gate must compare like with like — either convert
//      via network params (off-chain, baked into the bound) or store the window in POSIX time.
// Until then this logic is unit-tested in isolation and the gate stays dormant.

pub type PolicyWindow {
  first_minting_slot: Int,
  last_minting_slot: Int,
  sunset_slot: Int,
}

// Decode the `$handle_policies` admin datum and look up one policy's window.
//
// Confirmed on-chain shape (api.handle.me `/handles/handle_policies/datum`, GET /policies):
//   List[ Map( policy_id(bytes) -> [first_minting_slot, last_minting_slot, sunset_slot] ) ]
// i.e. a one-element Data list wrapping a Data map of 3-int lists (NOT CIP-68-wrapped, NOT a
// Constr). `0` in any slot field means "unset". Returns None if the policy isn't listed.
pub fn find_policy_window(
  handle_policies: Data,
  policy_id: PolicyId,
) -> Option<PolicyWindow> {
  expect [policy_map]: List<Pairs<PolicyId, (Int, Int, Int)>> = handle_policies
  when pairs.get_first(policy_map, policy_id) is {
    Some((first, last, sunset)) ->
      Some(
        PolicyWindow {
          first_minting_slot: first,
          last_minting_slot: last,
          sunset_slot: sunset,
        },
      )
    None -> None
  }
}

// `$handle_policies` stores SLOT numbers, but a Plutus V2 `validity_range` is POSIX time (ms)
// — so the window must be converted before it can be compared against the tx validity bounds
// (`mint_allowed_in_window`). Post-Shelley networks have a fixed slot length, so a known
// (slot, time) anchor plus the slot length converts exactly. The anchor + slot length are
// NETWORK config (mainnet/preprod/preview differ) — supplied at wiring time from settings /
// params, never hardcoded here.
pub fn slot_to_posix_ms(
  slot: Int,
  anchor_slot: Int,
  anchor_time_ms: Int,
  slot_length_ms: Int,
) -> Int {
  anchor_time_ms + ( slot - anchor_slot ) * slot_length_ms
}

// Convert a slot-domain window to the POSIX-ms domain (leaving `0`/unset fields as `0`), so the
// result can be passed straight to `mint_allowed_in_window` alongside the tx validity range.
pub fn window_to_posix(
  window: PolicyWindow,
  anchor_slot: Int,
  anchor_time_ms: Int,
  slot_length_ms: Int,
) -> PolicyWindow {
  let convert =
    fn(slot) {
      if slot <= 0 {
        0
      } else {
        slot_to_posix_ms(slot, anchor_slot, anchor_time_ms, slot_length_ms)
      }
    }
  PolicyWindow {
    first_minting_slot: convert(window.first_minting_slot),
    last_minting_slot: convert(window.last_minting_slot),
    sunset_slot: convert(window.sunset_slot),
  }
}

// Highest value of the unit (slot or posix-time, caller's choice) that the tx is valid for —
// i.e. the upper bound of its validity range. A mint is judged against this so the proof is
// monotone: if the latest moment the tx can be included still falls inside the window, it's ok.
pub fn validity_upper_bound(range: Interval<Int>) -> Option<Int> {
  let Interval { upper_bound, .. } = range
  let IntervalBound { bound_type, .. } = upper_bound
  when bound_type is {
    Finite(value) -> Some(value)
    _ -> None
  }
}

// Is a mint permitted under `window` for a tx whose validity upper bound is `upper`?
// `0` bounds are treated as "unset" (open). Semantics:
//   - first_minting_slot: mint must not be before the policy opened (upper >= first)
//   - last_minting_slot:  if set, mint must be at/before it (upper <= last)
//   - sunset_slot:        if set, mint must be strictly before it (upper < sunset) — the
//     cutover is exclusive, so at/after sunset this policy can no longer mint.
// All three open (0) => always allowed (the dormant default).
pub fn is_within_window(window: PolicyWindow, upper: Int) -> Bool {
  let PolicyWindow { first_minting_slot, last_minting_slot, sunset_slot } =
    window
  and {
    first_minting_slot <= 0 || upper >= first_minting_slot,
    last_minting_slot <= 0 || upper <= last_minting_slot,
    sunset_slot <= 0 || upper < sunset_slot,
  }
}

// Convenience: extract the tx's validity upper bound and check the window. An unbounded
// (infinite) validity upper bound is rejected when *any* bound is set — an open-ended tx can't
// prove it falls inside a finite window; with a fully-open window it's allowed.
pub fn mint_allowed_in_window(
  window: PolicyWindow,
  range: Interval<Int>,
) -> Bool {
  let PolicyWindow { first_minting_slot, last_minting_slot, sunset_slot } =
    window
  let fully_open = and {
      first_minting_slot <= 0,
      last_minting_slot <= 0,
      sunset_slot <= 0,
    }
  when validity_upper_bound(range) is {
    Some(upper) -> is_within_window(window, upper)
    None -> fully_open
  }
}
