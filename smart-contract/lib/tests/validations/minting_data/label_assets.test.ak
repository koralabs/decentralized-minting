use aiken/bytearray
use aiken/merkle_patricia_forestry as mpt
use aiken/transaction.{Input, NoDatum, Output, OutputReference, TransactionId}
use aiken/transaction/credential.{from_verification_key}
use aiken/transaction/value.{Value}
use common/cip68.{prefix_222}
use tests/mocks/fake_constants.{allowed_minter_0, minting_data_script_hash}
use tests/mocks/fake_tx.{
  make_minting_data_input, make_minting_data_output,
  make_settings_reference_input, make_transaction,
}
use validations/minting_data/types.{LabelAssetProof}
use validations/minting_data/validation.{can_mint_label_assets}

const legacy_policy = #"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"

const lbl_001 = #"00001070"

fn spending_ref() -> OutputReference {
  OutputReference {
    transaction_id: TransactionId { hash: #"aaab" },
    output_index: 0,
  }
}

// reference input holding the root's 222 owner NFT (the on-chain ownership proof)
fn owner_222_ref(handle: ByteArray) -> Input {
  Input {
    output_reference: OutputReference {
      transaction_id: TransactionId { hash: #"dddd" },
      output_index: 0,
    },
    output: Output {
      address: from_verification_key(#"99"),
      value: value.zero()
        |> value.add(legacy_policy, bytearray.concat(prefix_222, handle), 1),
      datum: NoDatum,
      reference_script: None,
    },
  }
}

fn label_proof(handle: ByteArray, amount: Int) -> LabelAssetProof {
  LabelAssetProof {
    mpt_proof: [],
    handle_name: handle,
    label: lbl_001,
    old_free_virtual_count: 0,
    old_labels: #"",
    amount,
  }
}

// trie with the root key present at value "" (no labels yet)
fn base(handle: ByteArray) -> mpt.MerklePatriciaForestry {
  mpt.insert(mpt.empty(), handle, #"", [])
}

fn label_mint_value(handle: ByteArray, qty: Int) -> Value {
  value.zero()
    |> value.add(legacy_policy, bytearray.concat(lbl_001, handle), qty)
}

// --- mint a 001 label: add it to the root's set + mint +1 of (policy, 001‖handle) ---

test mint_label_asset_ok() {
  let handle = "abc"
  let old_root = mpt.root(base(handle))
  let new_root =
    mpt.root(mpt.update(base(handle), handle, [], #"", lbl_001))
  let tx =
    make_transaction(
      [make_minting_data_input(old_root, minting_data_script_hash)],
      [make_settings_reference_input(), owner_222_ref(handle)],
      [make_minting_data_output(new_root, minting_data_script_hash)],
      label_mint_value(handle, 1),
      [],
      [allowed_minter_0],
    )
  can_mint_label_assets(tx, spending_ref(), [label_proof(handle, 1)], legacy_policy, 0)
}

// the owner 222 must be referenced — otherwise a minter can't fabricate label assets
test mint_label_asset_without_owner_ref_fails() fail {
  let handle = "abc"
  let old_root = mpt.root(base(handle))
  let new_root =
    mpt.root(mpt.update(base(handle), handle, [], #"", lbl_001))
  let tx =
    make_transaction(
      [make_minting_data_input(old_root, minting_data_script_hash)],
      // no owner 222 ref
      [make_settings_reference_input()],
      [make_minting_data_output(new_root, minting_data_script_hash)],
      label_mint_value(handle, 1),
      [],
      [allowed_minter_0],
    )
  can_mint_label_assets(tx, spending_ref(), [label_proof(handle, 1)], legacy_policy, 0)
}

// the allowed_minter must sign
test mint_label_asset_unsigned_fails() fail {
  let handle = "abc"
  let old_root = mpt.root(base(handle))
  let new_root =
    mpt.root(mpt.update(base(handle), handle, [], #"", lbl_001))
  let tx =
    make_transaction(
      [make_minting_data_input(old_root, minting_data_script_hash)],
      [make_settings_reference_input(), owner_222_ref(handle)],
      [make_minting_data_output(new_root, minting_data_script_hash)],
      label_mint_value(handle, 1),
      [],
      // no allowed_minter signature
      [],
    )
  can_mint_label_assets(tx, spending_ref(), [label_proof(handle, 1)], legacy_policy, 0)
}
