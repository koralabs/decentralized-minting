// BurnLabeledRoots (docs/spec/root-burn-with-labels.md): a root that holds WS1 registry labels burns
// atomically with every label token, deleting its key with the exact stored label set.
// Invariants proven here: the root key is deleted; its 222 + 100 AND every label token are burned in the
// same tx; nothing else is minted/burned; the proof's label set must equal the stored value; the root output
// keeps its address/value and carries the new root. Each `fail` test was mutation-checked against the
// check named in its comment (see the commit message).
use aiken/merkle_patricia_forestry as mpt
use aiken/primitive/bytearray
use cardano/assets.{Value} as value
use cardano/transaction.{OutputReference}
use common/cip68.{prefix_100, prefix_222}
use tests/mocks/fake_constants.{
  allowed_minter_0, minting_data_script_hash, new_policy_id,
}
use tests/mocks/fake_tx.{
  make_minting_data_input, make_minting_data_output,
  make_settings_reference_input, make_transaction,
}
use validations/minting_data/types.{LabeledRootBurnProof, LegacyHandleProof}
use validations/minting_data/validation.{
  can_burn_labeled_roots, can_burn_legacy_handles,
}

const legacy_policy =
  #"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"

const other_policy = #"6c32db33a422e0bc2cb535bb850b5a6e9a9572222056d6ddc9cbc26e"

const lbl_001 = #"00001070"

const lbl_002 = #"000020e0"

fn spending_ref() -> OutputReference {
  OutputReference { transaction_id: #"aaab", output_index: 0 }
}

fn proof(handle: ByteArray, labels: ByteArray) -> LabeledRootBurnProof {
  LabeledRootBurnProof { mpt_proof: [], handle_name: handle, labels }
}

fn root_holding(handle: ByteArray, labels: ByteArray) -> ByteArray {
  mpt.root(mpt.insert(mpt.empty, handle, labels, []))
}

fn empty_root() -> ByteArray {
  mpt.root(mpt.empty)
}

fn root_tokens_burned(handle: ByteArray) -> Value {
  value.zero
    |> value.add(legacy_policy, bytearray.concat(prefix_100, handle), -1)
    |> value.add(legacy_policy, bytearray.concat(prefix_222, handle), -1)
}

fn label_burned(mint: Value, label: ByteArray, handle: ByteArray) -> Value {
  mint |> value.add(legacy_policy, bytearray.concat(label, handle), -1)
}

fn burn_tx(
  stored_root: ByteArray,
  output_root: ByteArray,
  mint: Value,
) -> transaction.Transaction {
  burn_tx_signed(stored_root, output_root, mint, [])
}

// The settings reference input supplies the DeMi policy id and the allowed minters.
fn burn_tx_signed(
  stored_root: ByteArray,
  output_root: ByteArray,
  mint: Value,
  signers: List<ByteArray>,
) -> transaction.Transaction {
  make_transaction(
    [make_minting_data_input(stored_root, minting_data_script_hash)],
    [make_settings_reference_input()],
    [make_minting_data_output(output_root, minting_data_script_hash)],
    mint,
    [],
    signers,
  )
}

fn demi_root_tokens_burned(handle: ByteArray) -> Value {
  value.zero
    |> value.add(new_policy_id, bytearray.concat(prefix_100, handle), -1)
    |> value.add(new_policy_id, bytearray.concat(prefix_222, handle), -1)
}

fn demi_label_burned(mint: Value, label: ByteArray, handle: ByteArray) -> Value {
  mint |> value.add(new_policy_id, bytearray.concat(label, handle), -1)
}

// --- happy paths ---

test labeled_root_burn_ok() {
  let handle = "abc"
  let tx = burn_tx(
    root_holding(handle, lbl_001),
    empty_root(),
    root_tokens_burned(handle) |> label_burned(lbl_001, handle),
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, lbl_001)],
    legacy_policy,
  )
}

test labeled_root_burn_two_labels_ok() {
  let handle = "abc"
  let labels = bytearray.concat(lbl_001, lbl_002)
  let tx = burn_tx(
    root_holding(handle, labels),
    empty_root(),
    root_tokens_burned(handle)
      |> label_burned(lbl_001, handle)
      |> label_burned(lbl_002, handle),
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, labels)],
    legacy_policy,
  )
}

// --- adversarial ---

// The label token must be burned with its root (`mint == expected_mint_value`): no orphaned 001.
test labeled_root_burn_label_not_burned_fails() fail {
  let handle = "abc"
  let tx = burn_tx(
    root_holding(handle, lbl_001),
    empty_root(),
    root_tokens_burned(handle),
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, lbl_001)],
    legacy_policy,
  )
}

// Claiming fewer labels than stored (hiding 002 to keep its token): the delete value cannot match.
test labeled_root_burn_hides_a_label_fails() fail {
  let handle = "abc"
  let tx = burn_tx(
    root_holding(handle, bytearray.concat(lbl_001, lbl_002)),
    empty_root(),
    root_tokens_burned(handle) |> label_burned(lbl_001, handle),
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, lbl_001)],
    legacy_policy,
  )
}

// Claiming a different label than stored: the delete value cannot match.
test labeled_root_burn_wrong_label_fails() fail {
  let handle = "abc"
  let tx = burn_tx(
    root_holding(handle, lbl_001),
    empty_root(),
    root_tokens_burned(handle) |> label_burned(lbl_002, handle),
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, lbl_002)],
    legacy_policy,
  )
}

// Unlabeled roots must use BurnLegacyHandles (`labels_length > 0`).
test labeled_root_burn_empty_labels_fails() fail {
  let handle = "abc"
  let tx = burn_tx(
    root_holding(handle, #""),
    empty_root(),
    root_tokens_burned(handle),
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, #"")],
    legacy_policy,
  )
}

// Labels must be whole 4-byte prefixes (`labels_length % 4 == 0`).
test labeled_root_burn_partial_label_fails() fail {
  let handle = "abc"
  let partial = #"000010"
  let tx = burn_tx(
    root_holding(handle, partial),
    empty_root(),
    root_tokens_burned(handle),
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, partial)],
    legacy_policy,
  )
}

// Roots only (`!is_sub_handle_name`): a sub handle key can't be torn down through this path.
test labeled_root_burn_subhandle_name_fails() fail {
  let handle = "sub@abc"
  let tx = burn_tx(
    root_holding(handle, lbl_001),
    empty_root(),
    root_tokens_burned(handle) |> label_burned(lbl_001, handle),
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, lbl_001)],
    legacy_policy,
  )
}

// Nothing else may be minted or burned alongside (`mint == expected_mint_value`).
test labeled_root_burn_extra_asset_fails() fail {
  let handle = "abc"
  let tx = burn_tx(
    root_holding(handle, lbl_001),
    empty_root(),
    root_tokens_burned(handle)
      |> label_burned(lbl_001, handle)
      |> value.add(legacy_policy, bytearray.concat(prefix_222, "xyz"), -1),
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, lbl_001)],
    legacy_policy,
  )
}

// A label must burn under the legacy or the DeMi policy; a same-named asset under any other policy doesn't count.
test labeled_root_burn_label_wrong_policy_fails() fail {
  let handle = "abc"
  let tx = burn_tx(
    root_holding(handle, lbl_001),
    empty_root(),
    root_tokens_burned(handle)
      |> value.add(other_policy, bytearray.concat(lbl_001, handle), -1),
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, lbl_001)],
    legacy_policy,
  )
}

// The root output must carry the post-delete root (datum check).
test labeled_root_burn_root_not_advanced_fails() fail {
  let handle = "abc"
  let stored = root_holding(handle, lbl_001)
  let tx = burn_tx(
    stored,
    stored,
    root_tokens_burned(handle) |> label_burned(lbl_001, handle),
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, lbl_001)],
    legacy_policy,
  )
}

// Must actually burn the owner token: a label-only teardown that keeps the 222 is not a root burn.
test labeled_root_burn_owner_kept_fails() fail {
  let handle = "abc"
  let tx = burn_tx(
    root_holding(handle, lbl_001),
    empty_root(),
    value.zero
      |> value.add(legacy_policy, bytearray.concat(prefix_100, handle), -1)
      |> label_burned(lbl_001, handle),
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, lbl_001)],
    legacy_policy,
  )
}

// Regression anchor: the pre-existing BurnLegacyHandles still cannot delete a labeled root (it deletes
// with #""), which is why this redeemer exists.
test legacy_burn_of_labeled_root_still_fails() fail {
  let handle = "abc"
  let tx = burn_tx(
    root_holding(handle, lbl_001),
    empty_root(),
    root_tokens_burned(handle),
  )
  can_burn_legacy_handles(
    tx,
    spending_ref(),
    [LegacyHandleProof { mpt_proof: [], handle_name: handle, is_virtual: 0 }],
    legacy_policy,
  )
}

// --- DeMi roots and cross-policy labels (the spec's P = the policy that actually burns the 222; each label
// under its own burn policy). Mutation notes: forcing root_policy to legacy reddens the demi_root_*_ok tests;
// dropping the minter check greens demi_root_burn_without_minter_fails; resolving labels with the root's
// policy instead of find_label_burn_policy reddens the cross-policy/mixed ok tests. ---

test demi_root_burn_with_minter_ok() {
  let handle = "abc"
  let tx = burn_tx_signed(
    root_holding(handle, lbl_001),
    empty_root(),
    demi_root_tokens_burned(handle) |> demi_label_burned(lbl_001, handle),
    [allowed_minter_0],
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, lbl_001)],
    legacy_policy,
  )
}

// A DeMi root burn mutates the registry under the DeMi policy: an allowed minter must sign (like BurnDeMiHandles).
test demi_root_burn_without_minter_fails() fail {
  let handle = "abc"
  let tx = burn_tx(
    root_holding(handle, lbl_001),
    empty_root(),
    demi_root_tokens_burned(handle) |> demi_label_burned(lbl_001, handle),
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, lbl_001)],
    legacy_policy,
  )
}

// Cross-pollinated: a legacy root whose 001 lives under the DeMi policy tears down atomically (legacy key gates the root).
test legacy_root_with_demi_label_ok() {
  let handle = "abc"
  let tx = burn_tx(
    root_holding(handle, lbl_001),
    empty_root(),
    root_tokens_burned(handle) |> demi_label_burned(lbl_001, handle),
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, lbl_001)],
    legacy_policy,
  )
}

// Labels resolve independently: one legacy, one DeMi, on a DeMi root.
test demi_root_mixed_label_policies_ok() {
  let handle = "abc"
  let labels = bytearray.concat(lbl_001, lbl_002)
  let tx = burn_tx_signed(
    root_holding(handle, labels),
    empty_root(),
    demi_root_tokens_burned(handle)
      |> label_burned(lbl_001, handle)
      |> demi_label_burned(lbl_002, handle),
    [allowed_minter_0],
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, labels)],
    legacy_policy,
  )
}

// The 222 and 100 are a CIP-68 pair under one policy: a 100 burned under the other policy is rejected.
test root_pair_split_across_policies_fails() fail {
  let handle = "abc"
  let tx = burn_tx_signed(
    root_holding(handle, lbl_001),
    empty_root(),
    value.zero
      |> value.add(new_policy_id, bytearray.concat(prefix_222, handle), -1)
      |> value.add(legacy_policy, bytearray.concat(prefix_100, handle), -1)
      |> label_burned(lbl_001, handle),
    [allowed_minter_0],
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, lbl_001)],
    legacy_policy,
  )
}

// Without the settings reference input the DeMi policy / minters are unknown: refuse.
test labeled_root_burn_without_settings_fails() fail {
  let handle = "abc"
  let tx = make_transaction(
    [
      make_minting_data_input(
        root_holding(handle, lbl_001),
        minting_data_script_hash,
      ),
    ],
    [],
    [make_minting_data_output(empty_root(), minting_data_script_hash)],
    root_tokens_burned(handle) |> label_burned(lbl_001, handle),
    [],
    [],
  )
  can_burn_labeled_roots(
    tx,
    spending_ref(),
    [proof(handle, lbl_001)],
    legacy_policy,
  )
}
