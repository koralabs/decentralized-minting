use cardano/assets.{Value} as value
use tests/mocks/fake_constants.{new_policy_id}
use tests/mocks/fake_tx.{make_transaction}
use validations/minting_data/validation.{can_update_mpt}

// the operator root-sync key (any vkey hash — can_update_mpt takes it as a param, not from settings)
const admin = #"ad"

fn nonzero_mint() -> Value {
  value.zero |> value.add(new_policy_id, #"bb", 1)
}

// UpdateMPT (the operator syncMintingDataRoot path) protects exactly two things: it mints NOTHING,
// and it is signed by the admin/god key. Everything else (root correctness) is trusted to the human.

test update_mpt_admin_signed_no_mint_ok() {
  can_update_mpt(make_transaction([], [], [], value.zero, [], [admin]), admin)
}

test update_mpt_unsigned_fails() fail {
  // no admin signature -> rejected
  can_update_mpt(make_transaction([], [], [], value.zero, [], []), admin)
}

test update_mpt_with_mint_fails() fail {
  // mints something -> rejected (UpdateMPT must be a pure datum swap)
  can_update_mpt(make_transaction([], [], [], nonzero_mint(), [], [admin]), admin)
}
