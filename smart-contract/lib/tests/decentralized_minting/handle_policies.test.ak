use aiken/interval
use decentralized_minting/handle_policies.{
  PolicyWindow, is_within_window, mint_allowed_in_window, validity_upper_bound,
}

fn open_window() -> PolicyWindow {
  PolicyWindow { first_minting_slot: 0, last_minting_slot: 0, sunset_slot: 0 }
}

// legacy policy: opened at 100, no last, sunsets (cutover) at 1000
fn legacy_window() -> PolicyWindow {
  PolicyWindow { first_minting_slot: 100, last_minting_slot: 0, sunset_slot: 1000 }
}

// new policy: opened at 500, last 2000, no sunset
fn new_window() -> PolicyWindow {
  PolicyWindow { first_minting_slot: 500, last_minting_slot: 2000, sunset_slot: 0 }
}

// --- is_within_window ---

test open_window_always_allows() {
  and {
    is_within_window(open_window(), 0),
    is_within_window(open_window(), 999_999),
  }
}

test before_first_rejected() {
  is_within_window(legacy_window(), 50) == False
}

test at_first_allowed() {
  is_within_window(legacy_window(), 100)
}

test before_sunset_allowed() {
  is_within_window(legacy_window(), 999)
}

test at_sunset_rejected() {
  // sunset is exclusive — the cutover moment belongs to the new policy
  is_within_window(legacy_window(), 1000) == False
}

test after_sunset_rejected() {
  is_within_window(legacy_window(), 1500) == False
}

test new_policy_inside_window() {
  is_within_window(new_window(), 1500)
}

test new_policy_after_last_rejected() {
  is_within_window(new_window(), 2001) == False
}

test new_policy_at_last_allowed() {
  is_within_window(new_window(), 2000)
}

// --- validity_upper_bound ---

test finite_upper_bound() {
  validity_upper_bound(interval.before(900)) == Some(900)
}

test infinite_upper_bound() {
  validity_upper_bound(interval.after(100)) == None
}

// --- mint_allowed_in_window (extract + check) ---

test mint_allowed_finite_inside() {
  mint_allowed_in_window(legacy_window(), interval.before(900))
}

test mint_rejected_finite_at_sunset() {
  mint_allowed_in_window(legacy_window(), interval.before(1000)) == False
}

test mint_open_window_unbounded_ok() {
  // fully-open window allows an open-ended tx
  mint_allowed_in_window(open_window(), interval.after(100))
}

test mint_bounded_window_unbounded_rejected() {
  // a set window can't be satisfied by an open-ended (infinite upper) tx
  mint_allowed_in_window(legacy_window(), interval.after(100)) == False
}
