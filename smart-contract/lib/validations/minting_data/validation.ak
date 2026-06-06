use aiken/list
use aiken/merkle_patricia_forestry as mpt
use aiken/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction, find_input,
}
use aiken/transaction/value.{PolicyId}
use common/hashes.{VerificationKeyHash}
use decentralized_minting/handle_price.{resolve_handle_price_info}
use decentralized_minting/minting_data.{MintingData, resolve_minting_data}
use decentralized_minting/settings.{Settings, find_settings}
use decentralized_minting/settings_v1.{
  SettingsV1, get_allowed_minter_and_valid_handle_price_asset,
}
use validations/discount_eligibility.{DiscountContext, read_partner_root}
use validations/minting_data/types.{
  LabelAssetProof, LegacyHandleProof, OrderProof,
}
use validations/minting_data/utils.{
  all_label_proofs_are_valid, all_orders_are_satisfied, all_proofs_are_valid,
  calculate_treasury_fee_and_minter_fee, owner_fees_all_paid,
}
use validations/policy_window.{assert_mint_within_policy_window}

// Validation:
// All Decentralized Minting logic is here
//
// Checks
// - signed by allowed_minter
// - all orders are satisfied correctly (handle price, treasury fee, minter fee) 
// and minted values are sent to correct addresses
// - Proofs are valid (NOTE: must be in same order as orders UTxOs)
//
pub fn can_mint_new_handles(
  transaction: Transaction,
  spending_output_reference: OutputReference,
  proofs: List<OrderProof>,
  minter_index: Int,
  legacy_policy_id: PolicyId,
  anchor_slot: Int,
  anchor_time_ms: Int,
  slot_length_ms: Int,
) -> Bool {
  trace @"can_mint_new_handles"
  let Transaction {
    inputs,
    reference_inputs,
    outputs,
    extra_signatories,
    mint,
    validity_range,
    ..
  } = transaction

  // find settings and parse
  let Settings { data: settings_data, .. } = find_settings(reference_inputs)
  expect settings_datum: SettingsV1 = settings_data
  let SettingsV1 {
    policy_id: new_policy_id,
    allowed_minters,
    valid_handle_price_assets,
    treasury_address,
    treasury_fee_percentage,
    pz_script_address,
    order_script_hash,
    discount_config,
    sub_handle_minter_fee,
    sub_handle_treasury_fee,
    ..
  } = settings_datum

  // get allowed minter and valid handle price asset
  let (allowed_minter, valid_handle_price_asset) =
    get_allowed_minter_and_valid_handle_price_asset(
      allowed_minters,
      valid_handle_price_assets,
      minter_index,
    )

  // check if allowed_minter sign tx
  expect list.has(extra_signatories, allowed_minter)

  // WS7: new-policy mints must fall inside the new policy's $handle_policies window
  // (dormant until Kora sets a window; see assert_mint_within_policy_window)
  expect
    assert_mint_within_policy_window(
      reference_inputs,
      legacy_policy_id,
      new_policy_id,
      validity_range,
      anchor_slot,
      anchor_time_ms,
      slot_length_ms,
    )

  // find minting data input which is own input
  expect Some(spending_input) = find_input(inputs, spending_output_reference)
  let Input { output: minting_data_input, .. } = spending_input
  let MintingData { mpt_root_hash } = resolve_minting_data(minting_data_input)

  // parse outputs
  expect [
    minting_data_output,
    handle_price_info_output,
    treasury_output,
    minter_output,
    ..rest_outputs
  ] = outputs

  // resolve handle price info from handle price info output
  let handle_price_info =
    resolve_handle_price_info(
      handle_price_info_output,
      valid_handle_price_asset,
    )

  // expect proofs are not empty
  expect list.length(proofs) > 0

  // build merkle patricia trie from old root hash
  let root = mpt.from_root(mpt_root_hash)

  // WS5: discount context — config from settings, partner allowlist root from the
  // $pfp_policy_ids reference input (legacy policy holds the admin handles)
  let discount_ctx =
    DiscountContext {
      config: discount_config,
      reference_inputs,
      legacy_policy_id,
      new_policy_id,
      partner_root: read_partner_root(reference_inputs, legacy_policy_id),
    }

  // check orders with proofs. Root orders feed `total_handles_price` (percentage split); subhandle
  // orders accumulate flat minter/treasury totals + the merged per-owner fee list, and return the
  // leftover outputs (everything after the consumed token outputs) for the owner-fee check.
  let
    new_root,
    expected_mint_value,
    total_handles_price,
    total_sub_minter_fee,
    total_sub_treasury_fee,
    owner_fees,
    leftover_outputs,
  <-
    all_orders_are_satisfied(
      order_script_hash,
      inputs,
      rest_outputs,
      reference_inputs,
      new_policy_id,
      legacy_policy_id,
      pz_script_address,
      handle_price_info,
      sub_handle_minter_fee,
      sub_handle_treasury_fee,
      discount_config.free_virtual_count,
      proofs,
      root,
      value.zero(),
      0,
      0,
      0,
      [],
      discount_ctx,
    )

  // calculate new root and expected mint value
  let new_mpt_root_hash = new_root |> mpt.root

  // check minting data output
  expect minting_data_output.address == minting_data_input.address
  expect
    value.without_lovelace(minting_data_output.value) == value.without_lovelace(
      minting_data_input.value,
    )
  expect
    minting_data_output.datum == InlineDatum(
      MintingData { mpt_root_hash: new_mpt_root_hash },
    )
  expect minting_data_output.reference_script == None

  // Root-handle treasury/minter fee = percentage split of the root prices, with the 2-ADA floor.
  // The floor is a per-root-mint minimum, so it only applies when there ARE root handles in the
  // batch (total_handles_price > 0); an all-subhandle batch owes only the flat sub fees below.
  let (root_treasury_fee, root_minter_fee) =
    if total_handles_price > 0 {
      calculate_treasury_fee_and_minter_fee(
        total_handles_price,
        treasury_fee_percentage,
      )
    } else {
      (0, 0)
    }

  // Design A — the subhandle flat minter/treasury fees fold into Kora's single batch outputs, so
  // one treasury UTxO + one minter UTxO cover the whole mixed root+sub batch.
  // check treasury output (root percentage + all sub flat treasury fees)
  let Output {
    address: treasury_output_address,
    value: treasury_output_value,
    datum: treasury_output_datum,
    reference_script: treasury_output_reference_script,
  } = treasury_output
  expect treasury_output_address == treasury_address
  expect treasury_output_datum == InlineDatum(Void)
  expect
    value.lovelace_of(treasury_output_value) >= root_treasury_fee + total_sub_treasury_fee
  expect treasury_output_reference_script == None

  // check minter output (root percentage + all sub flat minter fees)
  let Output {
    value: minter_output_value,
    datum: minter_output_datum,
    reference_script: minter_output_reference_script,
    ..
  } = minter_output
  expect minter_output_datum == InlineDatum(Void)
  expect
    value.lovelace_of(minter_output_value) >= root_minter_fee + total_sub_minter_fee
  expect minter_output_reference_script == None

  // Owner fees — each owner (merged across the batch) must receive an output paying >= their total
  // to their payment credential. Checked over the LEFTOVER outputs only (the fee/token outputs are
  // already accounted for positionally), so no output can double-satisfy.
  expect owner_fees_all_paid(owner_fees, leftover_outputs)

  // check minted handles
  expect value.from_minted_value(mint) == expected_mint_value

  True
}

// Validation:
// Legacy Handle Minting logic is here
//
// Checks
// - Proofs are valid and mint values are correct according to proofs
//
pub fn can_mint_legacy_handles(
  transaction: Transaction,
  spending_output_reference: OutputReference,
  proofs: List<LegacyHandleProof>,
  legacy_policy_id: PolicyId,
  anchor_slot: Int,
  anchor_time_ms: Int,
  slot_length_ms: Int,
) -> Bool {
  trace @"can_mint_legacy_handles"
  // WS7: legacy-policy mints must fall inside the legacy policy's $handle_policies window
  // (the cutover sunset; dormant until set). Burns are intentionally NOT gated.
  let Transaction { reference_inputs, validity_range, .. } = transaction
  expect
    assert_mint_within_policy_window(
      reference_inputs,
      legacy_policy_id,
      legacy_policy_id,
      validity_range,
      anchor_slot,
      anchor_time_ms,
      slot_length_ms,
    )
  process_legacy_handles(
    transaction,
    spending_output_reference,
    proofs,
    legacy_policy_id,
    1,
  )
}

// Validation:
// Legacy Handle Burning logic is here
//
// Mirror of `can_mint_legacy_handles` with amount -1: each proof deletes its
// handle from the MPT and the tx must burn exactly the corresponding assets.
// Used to keep the MPT root in sync when a (virtual) legacy sub handle is burned
// (the legacy policy native script authorizes the actual burn; this enforces
// the root update when minting_data is spent).
//
pub fn can_burn_legacy_handles(
  transaction: Transaction,
  spending_output_reference: OutputReference,
  proofs: List<LegacyHandleProof>,
  legacy_policy_id: PolicyId,
) -> Bool {
  trace @"can_burn_legacy_handles"
  process_legacy_handles(
    transaction,
    spending_output_reference,
    proofs,
    legacy_policy_id,
    -1,
  )
}

// Shared mint/burn logic for legacy handles. `amount` is 1 for minting,
// -1 for burning; it drives both the MPT update (insert/delete) and the
// expected (positive/negative) mint value.
fn process_legacy_handles(
  transaction: Transaction,
  spending_output_reference: OutputReference,
  proofs: List<LegacyHandleProof>,
  legacy_policy_id: PolicyId,
  amount: Int,
) -> Bool {
  let Transaction { inputs, outputs, mint, .. } = transaction

  // find minting data input which is own input
  expect Some(spending_input) = find_input(inputs, spending_output_reference)
  let Input { output: minting_data_input, .. } = spending_input
  let MintingData { mpt_root_hash } = resolve_minting_data(minting_data_input)

  // parse outputs
  expect [minting_data_output, ..] = outputs

  // expect proofs are not empty
  expect list.length(proofs) > 0

  // build merkle patricia trie from old root hash
  let root = mpt.from_root(mpt_root_hash)

  // single pass: MPT updates (handle keys) + the expected ± mint value. Legacy enforces only
  // uniqueness + correct tokens — no fees/allowance/discounts (those are DeMi-path-only).
  let new_root, expected_mint_value <-
    all_proofs_are_valid(proofs, root, legacy_policy_id, amount, value.zero())

  // calculate new root and expected mint value
  let new_mpt_root_hash = new_root |> mpt.root

  // check minting data output
  expect minting_data_output.address == minting_data_input.address
  expect
    value.without_lovelace(minting_data_output.value) == value.without_lovelace(
      minting_data_input.value,
    )
  expect
    minting_data_output.datum == InlineDatum(
      MintingData { mpt_root_hash: new_mpt_root_hash },
    )
  expect minting_data_output.reference_script == None

  // check minted/burned handles match the proofs exactly
  expect value.from_minted_value(mint) == expected_mint_value

  True
}

// Validation:
// WS1 — Label-asset registry minting (001 settings, future 002, …).
//
// DeMi becomes the minter of the per-handle label assets. For each proof, the handle's MPT
// value (its canonical label set) is updated to add (+1) or remove (−1) the label, and the tx
// `mint` must carry exactly the matching ±1 of `(policy, label ‖ handle_name)`. Authorization:
//   - an `allowed_minter` (from settings, selected by `minter_index`) signs the tx, AND
//   - the tx references the root handle's 222 owner NFT (per proof, via `find_owner_policy`),
//     which also fixes the policy the label asset is minted under (legacy vs new).
// The contract records label *existence* only — it never interprets the label or its datum.
//
pub fn can_mint_label_assets(
  transaction: Transaction,
  spending_output_reference: OutputReference,
  proofs: List<LabelAssetProof>,
  legacy_policy_id: PolicyId,
  minter_index: Int,
) -> Bool {
  trace @"can_mint_label_assets"
  let Transaction {
    inputs,
    reference_inputs,
    outputs,
    extra_signatories,
    mint,
    ..
  } = transaction

  // settings: allowed minter + the new policy id
  let Settings { data: settings_data, .. } = find_settings(reference_inputs)
  expect settings_datum: SettingsV1 = settings_data
  let SettingsV1 {
    policy_id: new_policy_id,
    allowed_minters,
    valid_handle_price_assets,
    ..
  } = settings_datum

  let (allowed_minter, _valid_handle_price_asset) =
    get_allowed_minter_and_valid_handle_price_asset(
      allowed_minters,
      valid_handle_price_assets,
      minter_index,
    )
  expect list.has(extra_signatories, allowed_minter)

  // find minting data input which is own input
  expect Some(spending_input) = find_input(inputs, spending_output_reference)
  let Input { output: minting_data_input, .. } = spending_input
  let MintingData { mpt_root_hash } = resolve_minting_data(minting_data_input)

  // parse outputs
  expect [minting_data_output, ..] = outputs

  // expect proofs are not empty
  expect list.length(proofs) > 0

  // build merkle patricia trie from old root hash
  let root = mpt.from_root(mpt_root_hash)

  // process label proofs, accumulating new root + expected mint value
  let
    new_root,
    expected_mint_value,
  <-
    all_label_proofs_are_valid(
      proofs,
      root,
      reference_inputs,
      legacy_policy_id,
      new_policy_id,
      value.zero(),
    )

  // calculate new root
  let new_mpt_root_hash = new_root |> mpt.root

  // check minting data output (unchanged except the root hash)
  expect minting_data_output.address == minting_data_input.address
  expect
    value.without_lovelace(minting_data_output.value) == value.without_lovelace(
      minting_data_input.value,
    )
  expect
    minting_data_output.datum == InlineDatum(
      MintingData { mpt_root_hash: new_mpt_root_hash },
    )
  expect minting_data_output.reference_script == None

  // minted/burned label assets must match the proofs exactly
  expect value.from_minted_value(mint) == expected_mint_value

  True
}

pub fn can_update_mpt(
  transaction: Transaction,
  admin_verification_key_hash: VerificationKeyHash,
) -> Bool {
  let Transaction { extra_signatories, mint, .. } = transaction

  // must not mint anything
  expect value.from_minted_value(mint) == value.zero()

  // must be signed by god
  expect list.has(extra_signatories, admin_verification_key_hash)

  True
}
