use aiken/interval.{Finite, Interval, IntervalBound}

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
