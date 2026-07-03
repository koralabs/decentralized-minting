use aiken/merkle_patricia_forestry as mpt
use aiken/primitive/bytearray
use cardano/assets.{Value} as value
use cardano/transaction.{OutputReference}
use common/cip68.{prefix_000}
use tests/mocks/fake_constants.{
  allowed_minter_0, minting_data_script_hash, new_policy_id,
}
use tests/mocks/fake_tx.{
  make_minting_data_input, make_minting_data_output,
  make_settings_reference_input, make_transaction,
}
use validations/minting_data/types.{BurnProof}
use validations/minting_data/validation.{can_burn_demi_handles}

fn spending_ref() -> OutputReference {
  OutputReference { transaction_id: #"aaab", output_index: 0 }
}

// trie holding one virtual-sub key at value "" (no labels)
fn base(handle: ByteArray) -> mpt.MerklePatriciaForestry {
  mpt.insert(mpt.empty, handle, #"", [])
}

// the root after burning that key: delete the only key -> empty trie
fn new_root(handle: ByteArray) -> ByteArray {
  mpt.root(mpt.delete(base(handle), handle, #"", []))
}

fn burn_proof(handle: ByteArray) -> BurnProof {
  BurnProof {
    mpt_proof: [],
    handle_name: handle,
    is_virtual: 1,
    root_absence: None,
  }
}

// -1 of (new_policy, 000‖handle) — the virtual sub token actually burned
fn burn_value(handle: ByteArray) -> Value {
  value.zero
    |> value.add(new_policy_id, bytearray.concat(prefix_000, handle), -1)
}

// WS1 #4 — orphan reap requires a VALID root non-inclusion proof. With root_absence = Some but a
// bogus/empty proof (here the root "abc" is absent from the trie, but [] doesn't prove it), mpt.miss
// fails and the reap is rejected — you can't fabricate the absence. (A valid orphan reap with a real
// proof is exercised off-chain / in the combined-tx tests; aiken has no in-test proof builder.)
test burn_demi_handle_orphan_invalid_proof_fails() fail {
  let handle = "sub@abc"
  let proof = BurnProof {
    mpt_proof: [],
    handle_name: handle,
    is_virtual: 1,
    root_absence: Some([]),
  }
  let tx = make_transaction(
    [make_minting_data_input(mpt.root(base(handle)), minting_data_script_hash)],
    [make_settings_reference_input()],
    [make_minting_data_output(new_root(handle), minting_data_script_hash)],
    burn_value(handle),
    [],
    [allowed_minter_0],
  )
  can_burn_demi_handles(tx, spending_ref(), [proof])
}

// You can't delete a key without actually burning its token: the proof deletes the sub key, but the
// tx mints nothing, so `mint == expected_mint_value` fails. (Guards against ghost-deleting registry
// keys without the matching -1.)
test burn_demi_handle_mint_must_match_proofs_fails() fail {
  let handle = "sub@abc"
  let tx = make_transaction(
    [make_minting_data_input(mpt.root(base(handle)), minting_data_script_hash)],
    [make_settings_reference_input()],
    [make_minting_data_output(new_root(handle), minting_data_script_hash)],
    value.zero,
    [],
    [allowed_minter_0],
  )
  can_burn_demi_handles(tx, spending_ref(), [burn_proof(handle)])
}

// WS1 #1 — a DeMi-handle burn must be signed by an allowed_minter (the minter is the single
// serialized writer of the registry root). The three tests share one otherwise-valid virtual-sub
// burn; only the signer set differs.

test burn_demi_handle_minter_signed_ok() {
  let handle = "sub@abc"
  let tx = make_transaction(
    [make_minting_data_input(mpt.root(base(handle)), minting_data_script_hash)],
    [make_settings_reference_input()],
    [make_minting_data_output(new_root(handle), minting_data_script_hash)],
    burn_value(handle),
    [],
    [allowed_minter_0],
  )
  can_burn_demi_handles(tx, spending_ref(), [burn_proof(handle)])
}

test burn_demi_handle_unsigned_fails() fail {
  let handle = "sub@abc"
  let tx = make_transaction(
    [make_minting_data_input(mpt.root(base(handle)), minting_data_script_hash)],
    [make_settings_reference_input()],
    [make_minting_data_output(new_root(handle), minting_data_script_hash)],
    burn_value(handle),
    [],
    [],
  )
  can_burn_demi_handles(tx, spending_ref(), [burn_proof(handle)])
}

test burn_demi_handle_wrong_signer_fails() fail {
  let handle = "sub@abc"
  let tx = make_transaction(
    [make_minting_data_input(mpt.root(base(handle)), minting_data_script_hash)],
    [make_settings_reference_input()],
    [make_minting_data_output(new_root(handle), minting_data_script_hash)],
    burn_value(handle),
    [],
    [#"deadbeef"],
  )
  can_burn_demi_handles(tx, spending_ref(), [burn_proof(handle)])
}

// WS1 #3 / (B) — a key carrying a live registry value (a 001 label) cannot have its 222/000 burned.
// The key-delete uses value #"", so the MPF inclusion proof fails for a labeled key. The labels must
// be cleared first. Enforced for free by the delete semantics — this test pins it.
test burn_demi_handle_with_live_label_fails() fail {
  let handle = "sub@abc"
  let labeled = mpt.insert(mpt.empty, handle, #"00001070", [])
  let tx = make_transaction(
    [make_minting_data_input(mpt.root(labeled), minting_data_script_hash)],
    [make_settings_reference_input()],
    [make_minting_data_output(mpt.root(mpt.empty), minting_data_script_hash)],
    burn_value(handle),
    [],
    [allowed_minter_0],
  )
  can_burn_demi_handles(tx, spending_ref(), [burn_proof(handle)])
}
