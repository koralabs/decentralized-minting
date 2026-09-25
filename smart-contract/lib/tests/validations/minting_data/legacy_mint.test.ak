use aiken/merkle_patricia_forestry as mpt
use aiken/primitive/bytearray
use cardano/assets.{Value} as value
use cardano/transaction.{OutputReference}
use common/cip68.{prefix_000, prefix_100, prefix_222}
use tests/mocks/fake_constants.{minting_data_script_hash}
use tests/mocks/fake_tx.{
  make_handle_policies_reference_input, make_minting_data_input,
  make_minting_data_output, make_settings_reference_input, make_transaction,
}
use validations/minting_data/types.{LegacyHandleProof}
use validations/minting_data/validation.{
  can_burn_legacy_handles, can_mint_legacy_handles,
}

const legacy_policy =
  #"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"

fn spending_ref() -> OutputReference {
  OutputReference { transaction_id: #"aaab", output_index: 0 }
}

fn root_proof(handle: ByteArray) -> LegacyHandleProof {
  LegacyHandleProof { mpt_proof: [], handle_name: handle, is_virtual: 0 }
}

// kind 2: a bare CIP-25 legacy handle (no label prefix at all -- e.g. mainnet `$xar12345`)
fn cip25_proof(handle: ByteArray) -> LegacyHandleProof {
  LegacyHandleProof { mpt_proof: [], handle_name: handle, is_virtual: 2 }
}

// a CIP-25 burn mints/burns exactly `-1 * handle_name`, no label prefix
fn cip25_mint_value(handle: ByteArray, qty: Int) -> Value {
  value.zero |> value.add(legacy_policy, handle, qty)
}

// a non-virtual root legacy handle mints its 100 + 222 tokens
fn root_mint_value(handle: ByteArray, qty: Int) -> Value {
  value.zero
    |> value.add(legacy_policy, bytearray.concat(prefix_100, handle), qty)
    |> value.add(legacy_policy, bytearray.concat(prefix_222, handle), qty)
}

// single-element trie roots (empty proof, mirroring the MPF lib's own tests)
fn empty_root() -> ByteArray {
  mpt.root(mpt.empty)
}

fn root_with(handle: ByteArray) -> ByteArray {
  mpt.root(mpt.insert(mpt.empty, handle, #"", []))
}

// --- mint: insert the handle, mint 100+222, root advances empty -> {handle} ---

test legacy_root_mint_ok() {
  let handle = "abc"
  let tx = make_transaction(
    [make_minting_data_input(empty_root(), minting_data_script_hash)],
    [
      make_settings_reference_input(),
      make_handle_policies_reference_input(
        legacy_policy,
        legacy_policy,
        (0, 0, 0),
      ),
    ],
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
  let tx = make_transaction(
    [make_minting_data_input(empty_root(), minting_data_script_hash)],
    [
      make_settings_reference_input(),
      make_handle_policies_reference_input(
        legacy_policy,
        legacy_policy,
        (0, 0, 0),
      ),
    ],
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
  let tx = make_transaction(
    [make_minting_data_input(empty_root(), minting_data_script_hash)],
    [
      make_settings_reference_input(),
      make_handle_policies_reference_input(
        legacy_policy,
        legacy_policy,
        (0, 0, 0),
      ),
    ],
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
  let tx = make_transaction(
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

// --- CIP-25 legacy handle burn (kind 2): delete the bare-name key, burn exactly `-1 name` ---
// This is the operator-required feature: a pre-2023 CIP-25 handle (e.g. mainnet `$xar12345`) has
// no label prefix at all, so it cannot be represented by kind 0 (100+222) or kind 1 (000). Before
// this change, `is_virtual: 2` traps in `parse_bool_from_int` ("Invalid bool value") -- every test
// below fails without the fix, which is the required negative control.

// happy path: root advances {handle} -> empty, mint is exactly -1 of the bare handle_name asset
test cip25_burn_ok() {
  let handle = "xar12345"
  let tx = make_transaction(
    [make_minting_data_input(root_with(handle), minting_data_script_hash)],
    [],
    [make_minting_data_output(empty_root(), minting_data_script_hash)],
    cip25_mint_value(handle, -1),
    [],
    [],
  )
  can_burn_legacy_handles(
    tx,
    spending_ref(),
    [cip25_proof(handle)],
    legacy_policy,
  )
}

// failure: burning a DIFFERENT asset than the one the proof deletes must be rejected
test cip25_burn_wrong_asset_fails() fail {
  let handle = "xar12345"
  let tx = make_transaction(
    [make_minting_data_input(root_with(handle), minting_data_script_hash)],
    [],
    [make_minting_data_output(empty_root(), minting_data_script_hash)],
    cip25_mint_value("someoneelse", -1),
    [],
    [],
  )
  can_burn_legacy_handles(
    tx,
    spending_ref(),
    [cip25_proof(handle)],
    legacy_policy,
  )
}

// failure: burning an EXTRA asset alongside the correct one must be rejected (mint == expected_mint_value
// is an exact match, not a superset check)
test cip25_burn_extra_asset_fails() fail {
  let handle = "xar12345"
  let tx = make_transaction(
    [make_minting_data_input(root_with(handle), minting_data_script_hash)],
    [],
    [make_minting_data_output(empty_root(), minting_data_script_hash)],
    cip25_mint_value(handle, -1) |> value.add(legacy_policy, "extra", -1),
    [],
    [],
  )
  can_burn_legacy_handles(
    tx,
    spending_ref(),
    [cip25_proof(handle)],
    legacy_policy,
  )
}

// failure: a non-inclusion (key-absent) proof cannot delete a key that was never inserted --
// deleting against the empty root with the mint-only-child proof mpt.delete traps
test cip25_burn_key_absent_fails() fail {
  let handle = "xar12345"
  let tx = make_transaction(
    [make_minting_data_input(empty_root(), minting_data_script_hash)],
    [],
    [make_minting_data_output(empty_root(), minting_data_script_hash)],
    cip25_mint_value(handle, -1),
    [],
    [],
  )
  can_burn_legacy_handles(
    tx,
    spending_ref(),
    [cip25_proof(handle)],
    legacy_policy,
  )
}

// failure: the burn must be under the LEGACY policy -- a mint claiming a different policy id is rejected
test cip25_burn_wrong_policy_fails() fail {
  let handle = "xar12345"
  let other_policy = #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  let tx = make_transaction(
    [make_minting_data_input(root_with(handle), minting_data_script_hash)],
    [],
    [make_minting_data_output(empty_root(), minting_data_script_hash)],
    value.zero |> value.add(other_policy, handle, -1),
    [],
    [],
  )
  can_burn_legacy_handles(
    tx,
    spending_ref(),
    [cip25_proof(handle)],
    legacy_policy,
  )
}

// edge: a CIP-25 (kind 2) proof can NEVER be used to MINT -- there must be no path to a fresh
// bare-name asset under the legacy policy. This is the deliberate asymmetry vs. kinds 0/1.
test cip25_mint_rejected_fails() fail {
  let handle = "newhandle"
  let tx = make_transaction(
    [make_minting_data_input(empty_root(), minting_data_script_hash)],
    [
      make_settings_reference_input(),
      make_handle_policies_reference_input(
        legacy_policy,
        legacy_policy,
        (0, 0, 0),
      ),
    ],
    [make_minting_data_output(root_with(handle), minting_data_script_hash)],
    cip25_mint_value(handle, 1),
    [],
    [],
  )
  can_mint_legacy_handles(
    tx,
    spending_ref(),
    [cip25_proof(handle)],
    legacy_policy,
    0,
    0,
    1000,
  )
}

// edge: kinds 0 (root/nft) and 1 (virtual) are unaffected -- a virtual sub handle burn still
// mints/burns the 000 token, not the bare name (guards against the kind-mapping regressing)
test legacy_virtual_burn_still_uses_000_not_bare_name() {
  let handle = "sub@root"
  let virtual_proof = LegacyHandleProof {
    mpt_proof: [],
    handle_name: handle,
    is_virtual: 1,
  }
  let virtual_mint_value = value.zero
    |> value.add(legacy_policy, bytearray.concat(prefix_000, handle), -1)
  let tx = make_transaction(
    [make_minting_data_input(root_with(handle), minting_data_script_hash)],
    [],
    [make_minting_data_output(empty_root(), minting_data_script_hash)],
    virtual_mint_value,
    [],
    [],
  )
  can_burn_legacy_handles(tx, spending_ref(), [virtual_proof], legacy_policy)
}
