use cardano/assets as value
use tests/mocks/fake_constants.{minting_data_script_hash}
use tests/mocks/fake_tx.{make_minting_data_input, make_transaction}
use validations/mint_v1/validation.{can_burn_handles, can_mint_handles}

// The governor (demimnt) gates ALL minting/burning on the minting_data UTxO being spent from the
// minting_data script — it delegates every token-level rule to the demimntmpt spend validator there.

test governor_mint_requires_minting_data_spend() {
  let tx = make_transaction(
    [make_minting_data_input(#"", minting_data_script_hash)],
    [],
    [],
    value.zero,
    [],
    [],
  )
  can_mint_handles(tx, minting_data_script_hash)
}

test governor_mint_rejects_minting_data_at_wrong_script_fails() fail {
  let tx = make_transaction(
    [make_minting_data_input(#"", #"deadbeef")],
    [],
    [],
    value.zero,
    [],
    [],
  )
  can_mint_handles(tx, minting_data_script_hash)
}

test governor_mint_rejects_no_minting_data_spend_fails() fail {
  let tx = make_transaction([], [], [], value.zero, [], [])
  can_mint_handles(tx, minting_data_script_hash)
}

test governor_burn_requires_minting_data_spend() {
  let tx = make_transaction(
    [make_minting_data_input(#"", minting_data_script_hash)],
    [],
    [],
    value.zero,
    [],
    [],
  )
  can_burn_handles(tx, minting_data_script_hash)
}
