use aiken/bytearray
use aiken/merkle_patricia_forestry as mpt
use aiken/transaction.{OutputReference, TransactionId}
use aiken/transaction/value.{Value}
use common/cip68.{prefix_100, prefix_222}
use tests/mocks/fake_constants.{minting_data_script_hash}
use tests/mocks/fake_tx.{
  make_minting_data_input, make_minting_data_output,
  make_settings_reference_input, make_transaction,
}
use validations/minting_data/types.{LegacyHandleProof}
use validations/minting_data/validation.{
  can_burn_legacy_handles, can_mint_legacy_handles,
}

const legacy_policy =
  #"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"

fn spending_ref() -> OutputReference {
  OutputReference {
    transaction_id: TransactionId { hash: #"aaab" },
    output_index: 0,
  }
}

fn root_proof(handle: ByteArray) -> LegacyHandleProof {
  LegacyHandleProof { mpt_proof: [], handle_name: handle, is_virtual: 0 }
}

// a non-virtual root legacy handle mints its 100 + 222 tokens
fn root_mint_value(handle: ByteArray, qty: Int) -> Value {
  value.zero()
    |> value.add(legacy_policy, bytearray.concat(prefix_100, handle), qty)
    |> value.add(legacy_policy, bytearray.concat(prefix_222, handle), qty)
}

// single-element trie roots (empty proof, mirroring the MPF lib's own tests)
fn empty_root() -> ByteArray {
  mpt.root(mpt.empty())
}

fn root_with(handle: ByteArray) -> ByteArray {
  mpt.root(mpt.insert(mpt.empty(), handle, #"", []))
}

// --- mint: insert the handle, mint 100+222, root advances empty -> {handle} ---

test legacy_root_mint_ok() {
  let handle = "abc"
  let tx =
    make_transaction(
      [make_minting_data_input(empty_root(), minting_data_script_hash)],
      [make_settings_reference_input()],
      [make_minting_data_output(root_with(handle), minting_data_script_hash)],
      root_mint_value(handle, 1),
      [],
      [],
    )
  can_mint_legacy_handles(
    tx,
    spending_ref(),
    [root_proof(handle)],
    legacy_policy,
    0,
    0,
    1000,
  )
}

// the output root must reflect the insert
test legacy_root_mint_wrong_output_root_fails() fail {
  let handle = "abc"
  let tx =
    make_transaction(
      [make_minting_data_input(empty_root(), minting_data_script_hash)],
      [make_settings_reference_input()],
      // wrong: output keeps the empty root
      [make_minting_data_output(empty_root(), minting_data_script_hash)],
      root_mint_value(handle, 1),
      [],
      [],
    )
  can_mint_legacy_handles(
    tx,
    spending_ref(),
    [root_proof(handle)],
    legacy_policy,
    0,
    0,
    1000,
  )
}

// the mint value must match the proofs exactly
test legacy_root_mint_unbacked_mint_fails() fail {
  let handle = "abc"
  let tx =
    make_transaction(
      [make_minting_data_input(empty_root(), minting_data_script_hash)],
      [make_settings_reference_input()],
      [make_minting_data_output(root_with(handle), minting_data_script_hash)],
      // mints a DIFFERENT handle than the proof
      root_mint_value("xyz", 1),
      [],
      [],
    )
  can_mint_legacy_handles(
    tx,
    spending_ref(),
    [root_proof(handle)],
    legacy_policy,
    0,
    0,
    1000,
  )
}

// --- burn: delete the handle, burn 100+222, root advances {handle} -> empty ---

test legacy_root_burn_ok() {
  let handle = "abc"
  let tx =
    make_transaction(
      [make_minting_data_input(root_with(handle), minting_data_script_hash)],
      [],
      [make_minting_data_output(empty_root(), minting_data_script_hash)],
      root_mint_value(handle, -1),
      [],
      [],
    )
  can_burn_legacy_handles(
    tx,
    spending_ref(),
    [root_proof(handle)],
    legacy_policy,
  )
}
