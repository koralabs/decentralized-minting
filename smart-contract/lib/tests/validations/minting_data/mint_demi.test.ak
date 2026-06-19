use cardano/assets.{Value} as value
use cardano/transaction.{OutputReference}
use tests/mocks/fake_tx.{make_settings_reference_input, make_transaction}
use validations/minting_data/validation.{can_mint_demi_handles}

const legacy_policy = #"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"

fn spending_ref() -> OutputReference {
  OutputReference { transaction_id: #"aaab", output_index: 0 }
}

fn nothing() -> Value {
  value.zero
}

// MintDeMiHandles is gated by the allowed_minter signature (selected by minter_index) — checked
// before any order is processed. An unsigned mint is rejected. (The order-satisfaction, fee, free-
// virtual, discount, window and handle-validity protections are unit-tested in their own modules.)
test mint_demi_handles_unsigned_fails() fail {
  let tx =
    make_transaction([], [make_settings_reference_input()], [], nothing(), [], [])
  can_mint_demi_handles(tx, spending_ref(), [], 0, legacy_policy, 0, 0, 1)
}
