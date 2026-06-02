use aiken/interval
use decentralized_minting/handle_policies.{
  PolicyWindow, find_policy_window, is_within_window, mint_allowed_in_window,
  slot_to_posix_ms, validity_upper_bound, window_to_posix,
}

// real on-chain values from api.handle.me /policies (mainnet $handle_policies)
const legacy_policy = #"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"

const policy_2 = #"6c32db33a422e0bc2cb535bb850b5a6e9a9572222056d6ddc9cbc26e"

// mainnet Shelley anchor: slot 4492800 == 1596059091000 ms, 1000 ms/slot
const anchor_slot = 4492800

const anchor_time_ms = 1596059091000

const slot_ms = 1000

// List[ Map(policy -> [first,last,sunset]) ] — the confirmed on-chain shape.
// Concrete type; coerces to Data when passed to find_policy_window's Data param.
fn handle_policies_datum() -> List<Pairs<ByteArray, (Int, Int, Int)>> {
  let policy_map =
    [Pair(legacy_policy, (47931333, 0, 0)), Pair(policy_2, (151974982, 0, 0))]
  [policy_map]
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

// --- find_policy_window (decodes the real $handle_policies datum shape) ---

test find_legacy_window() {
  find_policy_window(handle_policies_datum(), legacy_policy) == Some(
    PolicyWindow {
      first_minting_slot: 47931333,
      last_minting_slot: 0,
      sunset_slot: 0,
    },
  )
}

test find_policy_2_window() {
  find_policy_window(handle_policies_datum(), policy_2) == Some(
    PolicyWindow {
      first_minting_slot: 151974982,
      last_minting_slot: 0,
      sunset_slot: 0,
    },
  )
}

test find_unknown_policy_is_none() {
  find_policy_window(handle_policies_datum(), #"deadbeef") == None
}

// --- slot -> posix (ms) conversion ---

test slot_at_anchor() {
  slot_to_posix_ms(anchor_slot, anchor_slot, anchor_time_ms, slot_ms) == anchor_time_ms
}

test slot_one_after_anchor() {
  slot_to_posix_ms(anchor_slot + 1, anchor_slot, anchor_time_ms, slot_ms) == anchor_time_ms + 1000
}

test window_to_posix_converts_set_keeps_unset() {
  let w =
    PolicyWindow {
      first_minting_slot: anchor_slot + 1,
      last_minting_slot: 0,
      sunset_slot: anchor_slot + 60,
    }
  window_to_posix(w, anchor_slot, anchor_time_ms, slot_ms) == PolicyWindow {
    first_minting_slot: anchor_time_ms + 1000,
    last_minting_slot: 0,
    sunset_slot: anchor_time_ms + 60_000,
  }
}

// --- end-to-end: convert the slot window, then gate the posix validity range ---

test posix_gate_before_sunset_ok() {
  // sunset at anchor_slot+1000 -> posix anchor_time+1_000_000; tx valid-to anchor_time+500_000
  let slot_window =
    PolicyWindow {
      first_minting_slot: anchor_slot,
      last_minting_slot: 0,
      sunset_slot: anchor_slot + 1000,
    }
  let posix_window = window_to_posix(slot_window, anchor_slot, anchor_time_ms, slot_ms)
  mint_allowed_in_window(posix_window, interval.before(anchor_time_ms + 500_000))
}

test posix_gate_after_sunset_rejected() {
  let slot_window =
    PolicyWindow {
      first_minting_slot: anchor_slot,
      last_minting_slot: 0,
      sunset_slot: anchor_slot + 1000,
    }
  let posix_window = window_to_posix(slot_window, anchor_slot, anchor_time_ms, slot_ms)
  // tx valid-to anchor_time+1_000_000 == the sunset -> rejected (exclusive)
  mint_allowed_in_window(posix_window, interval.before(anchor_time_ms + 1_000_000)) == False
}
