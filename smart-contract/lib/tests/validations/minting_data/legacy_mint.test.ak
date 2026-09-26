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
// no label prefix at all, so it cannot be represented by kind 0 (100+222) or kind 1 (000).
//
// NOTE on "fails without this change": on master, `is_virtual: 2` (or `3`) traps in
// `parse_bool_from_int` immediately -- but for every `test ... fail { .. }` below, a trap is
// exactly what `fail` expects, so aiken reports those as PASS on master, not fail (verified: built
// this test file against master's validation code and confirmed every `fail`-annotated test below
// reports "pass" there). Only `cip25_burn_ok` (no `fail` annotation, the happy path) genuinely
// fails on master. So "it fails on master" is not evidence any of these tests exercise the
// mechanism their name claims -- that is established instead by mutation testing against the
// committed fix (each mutation applied in an isolated /tmp scratch copy, not committed):
//   - cip25_mint_rejected_fails   <- deleting `expect kind != 2 || amount == -1` turns it red
//   - cip25_burn_ok               <- changing the kind-2 branch to emit 100+222 turns it red
//   - cip25_burn_wrong_asset_fails / cip25_burn_extra_asset_fails / cip25_burn_wrong_policy_fails
//                                 <- disabling `expect mint == expected_mint_value` turns all three
//                                    red (cip25_burn_ok and cip25_burn_key_absent_fails, which don't
//                                    depend on that check, are unaffected -- confirming the mapping)
//   - cip25_burn_key_absent_fails <- exercises mpt.delete's own inclusion-proof requirement (the
//                                    same call site kinds 0/1 already use for their burns)
//   - cip25_burn_subhandle_shape_rejected_fails
//                                 <- deleting `expect kind != 2 || !is_sub_handle_name(...)` turns
//                                    it red
//   - legacy_kind3_mint_fails / legacy_kind3_burn_fails
//                                 <- STILL trap with both domain-guard `expect`s deleted, because
//                                    `update_legacy_mint_value`'s match is exhaustive (`_ -> fail`)

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

// edge: CIP-25 predates SubHandles, so a kind-2 proof naming a `root@sub`-shaped asset is rejected
// outright, rather than silently falling through to the bare-name branch
test cip25_burn_subhandle_shape_rejected_fails() fail {
  let handle = "sub@root"
  let bad_proof = LegacyHandleProof {
    mpt_proof: [],
    handle_name: handle,
    is_virtual: 2,
  }
  let tx = make_transaction(
    [make_minting_data_input(root_with(handle), minting_data_script_hash)],
    [],
    [make_minting_data_output(empty_root(), minting_data_script_hash)],
    cip25_mint_value(handle, -1),
    [],
    [],
  )
  can_burn_legacy_handles(tx, spending_ref(), [bad_proof], legacy_policy)
}

// defense-in-depth: kind 3+ is rejected twice over -- the domain guard in `all_proofs_are_valid`
// (`expect kind == 0 || kind == 1 || kind == 2`), AND `update_legacy_mint_value`'s exhaustive match
// (`_ -> fail @"INVALID_LEGACY_HANDLE_KIND"`) if that guard were ever removed/bypassed. Verified in
// a scratch copy with the domain guard deleted that both tests below still fail on the exhaustive
// match alone -- the mint-value builder is not a de-facto "anything else is CIP-25" catch-all.
test legacy_kind3_mint_fails() fail {
  let handle = "newhandle"
  let bad_proof = LegacyHandleProof {
    mpt_proof: [],
    handle_name: handle,
    is_virtual: 3,
  }
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
    value.zero |> value.add(legacy_policy, handle, 1),
    [],
    [],
  )
  can_mint_legacy_handles(
    tx,
    spending_ref(),
    [bad_proof],
    legacy_policy,
    0,
    0,
    1000,
  )
}

test legacy_kind3_burn_fails() fail {
  let handle = "xar12345"
  let bad_proof = LegacyHandleProof {
    mpt_proof: [],
    handle_name: handle,
    is_virtual: 3,
  }
  let tx = make_transaction(
    [make_minting_data_input(root_with(handle), minting_data_script_hash)],
    [],
    [make_minting_data_output(empty_root(), minting_data_script_hash)],
    value.zero |> value.add(legacy_policy, handle, -1),
    [],
    [],
  )
  can_burn_legacy_handles(tx, spending_ref(), [bad_proof], legacy_policy)
}

// regression guard (kind 1 already exists on master and this test passes there too -- it is not a
// new-capability test): a virtual sub handle burn still mints/burns the 000 token, not the bare
// name, so widening is_virtual's domain to 3 kinds did not silently renumber 0/1's meaning
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
