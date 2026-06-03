use aiken/bytearray
use aiken/math
use aiken/merkle_patricia_forestry as mpt
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/credential.{Address, ScriptCredential}
use aiken/transaction/value.{PolicyId, Value, ada_asset_name, ada_policy_id}
use common/cip68.{prefix_000, prefix_100, prefix_222}
use common/handle.{parse_handle_name}
use common/hashes.{ScriptHash}
use common/utils.{parse_bool_from_int}
use decentralized_minting/handle_price.{HandlePriceInfo, get_handle_price}
use decentralized_minting/label_set
use decentralized_minting/orders.{OrderDatum}
use decentralized_minting/settings_v1.{min_treasury_fee}
use decentralized_minting/sub_handle.{
  find_root_handle_settings, sub_handle_kora_fee,
}
use validations/discount_eligibility.{DiscountContext, effective_handle_price}
use validations/minting_data/types.{LabelAssetProof, LegacyHandleProof}

// WS6: root-handle character cap. Bumped 15 -> 28 (the on-chain gatekeeper that actually
// lets 28-char roots mint). `max_sub_handle_length` is the full `sub@root` cap and stays 28,
// so a root past ~26 chars can't also carry a subhandle (full length would exceed the cap).
const max_handle_length = 28

const max_sub_handle_length = 28

// This function checks only new handles orders are satisfied
pub fn all_orders_are_satisfied(
  order_script_hash: ScriptHash,
  inputs: List<Input>,
  outputs: List<Output>,
  policy_id: PolicyId,
  pz_script_address: Address,
  handle_price_info: HandlePriceInfo,
  proofs: List<mpt.Proof>,
  root: mpt.MerklePatriciaForestry,
  expected_mint_value: Value,
  total_handles_price: Int,
  // WS5: discount context (config + ref inputs + policies + partner root)
  discount_ctx: DiscountContext,
  continuation: fn(mpt.MerklePatriciaForestry, Value, Int) -> result,
) -> result {
  // go through inputs and process order UTxO
  when inputs is {
    [] -> continuation(root, expected_mint_value, total_handles_price)
    [order_input, ..rest_inputs] -> {
      let Output { address, datum, .. } = order_input.output
      let is_order = is_order_script_address(address, order_script_hash)
      when is_order is {
        True -> {
          // parse order datum
          expect InlineDatum(datum) = datum
          expect datum: OrderDatum = datum
          let OrderDatum {
            requested_handle,
            destination_address,
            discount_claim,
            ..
          } = datum

          // parse proofs
          expect [mpt_proof, ..rest_proofs] = proofs

          // check handle validity and get price
          let handle_price =
            check_new_handle_validity_and_get_price(
              requested_handle,
              handle_price_info,
            )

          // WS5: apply any (validated) discount claim to the required price. A forged claim
          // fails the tx; no claim leaves the price unchanged.
          let effective_price =
            effective_handle_price(
              handle_price,
              discount_claim,
              destination_address,
              discount_ctx,
            )
          //
          // update root
          // NOTE:
          // for now we assume that all order is for minting (not burning)
          let new_root = update_root(root, requested_handle, 1, mpt_proof)

          // check order input has enough lovelace for the (possibly discounted) price
          let order_input_lovelace =
            value.quantity_of(
              order_input.output.value,
              ada_policy_id,
              ada_asset_name,
            )
          let order_is_enough = order_input_lovelace >= effective_price
          expect order_is_enough

          // extract ref & user output (or virtual output)
          // check minted assets are correctly sent to correct address
          // and returns rest_outputs and new_mint_value to continue processing
          let (rest_outputs, new_mint_value) =
            check_ref_and_user_outputs(
              outputs,
              policy_id,
              requested_handle,
              pz_script_address,
              destination_address,
              expected_mint_value,
            )

          all_orders_are_satisfied(
            order_script_hash,
            rest_inputs,
            rest_outputs,
            policy_id,
            pz_script_address,
            handle_price_info,
            rest_proofs,
            new_root,
            new_mint_value,
            // fees compute on what the user actually pays (the discounted price)
            total_handles_price + effective_price,
            discount_ctx,
            continuation,
          )
        }

        False ->
          all_orders_are_satisfied(
            order_script_hash,
            rest_inputs,
            outputs,
            policy_id,
            pz_script_address,
            handle_price_info,
            proofs,
            root,
            expected_mint_value,
            total_handles_price,
            discount_ctx,
            continuation,
          )
      }
    }
  }
}

// Validate a batch of legacy handle proofs against the MPT root.
// `amount` is 1 for minting (insert key, add to expected mint value)
// or -1 for burning (delete key, subtract from expected mint value).
pub fn all_proofs_are_valid(
  proofs: List<LegacyHandleProof>,
  root: mpt.MerklePatriciaForestry,
  legacy_policy_id: PolicyId,
  amount: Int,
  expected_mint_value: Value,
  continuation: fn(mpt.MerklePatriciaForestry, Value) -> result,
) -> result {
  when proofs is {
    [] -> continuation(root, expected_mint_value)
    [proof, ..rest_proofs] -> {
      let LegacyHandleProof { mpt_proof, handle_name, is_virtual } = proof
      let is_virtual_bool = parse_bool_from_int(is_virtual)

      // check handle is valid
      expect check_legacy_handle_validity(handle_name, is_virtual_bool)

      // update root (insert when minting, delete when burning)
      let new_root = update_root(root, handle_name, amount, mpt_proof)

      // update mint value (positive when minting, negative when burning)
      let new_mint_value =
        update_mint_value(
          expected_mint_value,
          legacy_policy_id,
          handle_name,
          is_virtual_bool,
          amount,
        )

      all_proofs_are_valid(
        rest_proofs,
        new_root,
        legacy_policy_id,
        amount,
        new_mint_value,
        continuation,
      )
    }
  }
}

// WS1 — process each label-asset proof, accumulating the new MPT root and the expected
// (signed) mint value. Couples the registry value to the tx mint: adding a label to a handle's
// set requires +1 of that label asset minted; removing requires −1 (burn). The label asset's
// policy is the one under which the handle's 222 owner token is referenced (see
// `find_owner_policy`), mirroring the existing new/legacy policy split.
pub fn all_label_proofs_are_valid(
  proofs: List<LabelAssetProof>,
  root: mpt.MerklePatriciaForestry,
  reference_inputs: List<Input>,
  legacy_policy_id: PolicyId,
  new_policy_id: PolicyId,
  expected_mint_value: Value,
  continuation: fn(mpt.MerklePatriciaForestry, Value) -> result,
) -> result {
  when proofs is {
    [] -> continuation(root, expected_mint_value)
    [proof, ..rest_proofs] -> {
      let LabelAssetProof { mpt_proof, handle_name, label, old_value, amount } =
        proof

      // owner proof -> the policy this handle's label asset is minted under
      let policy =
        find_owner_policy(
          reference_inputs,
          handle_name,
          legacy_policy_id,
          new_policy_id,
        )

      // update the registry value at this key (apply guards amount = +/-1 and the
      // add-only-if-absent / remove-only-if-present legality)
      let new_value = label_set.apply(old_value, label, amount)
      let new_root = mpt.update(root, handle_name, mpt_proof, old_value, new_value)

      // expected mint: +/-1 of (policy, label ++ handle_name)
      let label_asset_name = bytearray.concat(label, handle_name)
      let new_mint_value =
        expected_mint_value |> value.add(policy, label_asset_name, amount)

      all_label_proofs_are_valid(
        rest_proofs,
        new_root,
        reference_inputs,
        legacy_policy_id,
        new_policy_id,
        new_mint_value,
        continuation,
      )
    }
  }
}

// WS4 — total Kora (treasury) fee owed across a batch of legacy proofs. Only SUBHANDLE mints
// owe a fee (root handles are priced off-chain via the session flow); for each, the fee is the
// treasury cut of the root owner's tier price for that sub's length + kind (nft/virtual). The
// root's OwnerSettings is read from a reference input. Burns/root mints contribute 0.
pub fn sub_handle_kora_fee_total(
  proofs: List<LegacyHandleProof>,
  reference_inputs: List<Input>,
  new_policy_id: PolicyId,
  legacy_policy_id: PolicyId,
  treasury_fee_percentage: Int,
) -> Int {
  when proofs is {
    [] -> 0
    [proof, ..rest] -> {
      let LegacyHandleProof { handle_name, is_virtual, .. } = proof
      let (root_handle_name, is_sub_handle, sub_handle_name) =
        parse_handle_name(handle_name)
      let fee =
        if is_sub_handle {
          let owner_settings =
            find_root_handle_settings(
              reference_inputs,
              root_handle_name,
              new_policy_id,
              legacy_policy_id,
            )
          sub_handle_kora_fee(
            owner_settings,
            bytearray.length(sub_handle_name),
            parse_bool_from_int(is_virtual),
            treasury_fee_percentage,
          )
        } else {
          0
        }
      fee + sub_handle_kora_fee_total(
        rest,
        reference_inputs,
        new_policy_id,
        legacy_policy_id,
        treasury_fee_percentage,
      )
    }
  }
}

// WS1 auth — locate the policy under which the root handle's 222 owner NFT is referenced.
// The tx must present (as a reference input) the 222 owner token for `handle_name` under
// either the legacy or the new policy. Fails if no such reference input exists, so a
// misbehaving engine cannot create label assets for a handle whose owner token isn't on tx.
fn find_owner_policy(
  reference_inputs: List<Input>,
  handle_name: ByteArray,
  legacy_policy_id: PolicyId,
  new_policy_id: PolicyId,
) -> PolicyId {
  let owner_asset_name = bytearray.concat(prefix_222, handle_name)
  when reference_inputs is {
    [] -> fail @"OWNER_222_NOT_REFERENCED"
    [ref_input, ..rest] -> {
      let Input { output: Output { value: ref_value, .. }, .. } = ref_input
      if value.quantity_of(ref_value, legacy_policy_id, owner_asset_name) >= 1 {
        legacy_policy_id
      } else if value.quantity_of(ref_value, new_policy_id, owner_asset_name) >= 1 {
        new_policy_id
      } else {
        find_owner_policy(rest, handle_name, legacy_policy_id, new_policy_id)
      }
    }
  }
}

fn is_order_script_address(
  address: Address,
  order_script_hash: ScriptHash,
) -> Bool {
  when address.payment_credential is {
    ScriptCredential(sc) -> sc == order_script_hash
    _ -> False
  }
}

// This function checks if new handle is valid or not
// and returns the price of the handle
//
pub fn check_new_handle_validity_and_get_price(
  handle_name: ByteArray,
  handle_price_info: HandlePriceInfo,
) -> Int {
  // parse handle name
  // get root handle name and is sub handle
  let (_root_handle_name, is_sub_handle, _sub_handle_name) =
    parse_handle_name(handle_name)

  // sub handle is not supported for new handles
  expect !is_sub_handle

  // check handle's length
  let handle_length = bytearray.length(handle_name)
  expect handle_length <= max_handle_length
  expect handle_length > 0

  let (current_price, prev_price) =
    get_handle_price(handle_price_info, handle_length)

  // we only consider the miniume price for user's sake
  let handle_price = math.min(current_price, prev_price)
  handle_price
}

pub fn check_legacy_handle_validity(
  handle_name: ByteArray,
  is_virtual: Bool,
) -> Bool {
  // parse handle name
  // get root handle name and is sub handle
  let (root_handle_name, is_sub_handle, sub_handle_name) =
    parse_handle_name(handle_name)
  let handle_length = bytearray.length(handle_name)
  let root_handle_length = bytearray.length(root_handle_name)
  let sub_handle_length = bytearray.length(sub_handle_name)

  if is_sub_handle {
    expect handle_length <= max_sub_handle_length
    expect root_handle_length <= max_handle_length
    expect root_handle_length > 0
    expect sub_handle_length > 0

    True
  } else {
    // only subhandle can be virtual
    expect !is_virtual

    expect handle_length <= max_handle_length
    expect handle_length > 0

    True
  }
}

fn check_ref_and_user_outputs(
  outputs: List<Output>,
  policy_id: PolicyId,
  handle_name: ByteArray,
  pz_script_address: Address,
  destination_address: Address,
  mint_value: Value,
) -> (List<Output>, Value) {
  // make ref asset name and user asset name from handle_name
  let ref_asset_name = bytearray.concat(prefix_100, handle_name)
  let user_asset_name = bytearray.concat(prefix_222, handle_name)

  // parse ref and user outputs
  expect [ref_output, user_output, ..rest_outputs] = outputs
  let Output {
    address: ref_output_address,
    value: ref_output_value,
    reference_script: ref_output_reference_script,
    ..
  } = ref_output
  let Output { address: user_output_address, value: user_output_value, .. } =
    user_output

  // check ref output
  expect ref_output_address == pz_script_address
  let expected_ref_value =
    value.zero()
      |> value.add(policy_id, ref_asset_name, 1)
  expect value.without_lovelace(ref_output_value) == expected_ref_value
  // ref asset's datum is set by minter
  expect ref_output_reference_script == None

  // check user output
  expect user_output_address == destination_address
  let user_output_value_has_handle =
    value.quantity_of(user_output_value, policy_id, user_asset_name) == 1
  expect user_output_value_has_handle

  // update mint value
  let new_mint_value =
    mint_value
      |> value.add(policy_id, ref_asset_name, 1)
      |> value.add(policy_id, user_asset_name, 1)

  (rest_outputs, new_mint_value)
}

fn update_root(
  root: mpt.MerklePatriciaForestry,
  handle_name: ByteArray,
  amount: Int,
  mpt_proof: mpt.Proof,
) -> mpt.MerklePatriciaForestry {
  when amount is {
    1 ->
      // mint
      mpt.insert(root, handle_name, #"", mpt_proof)
    -1 ->
      // burn
      mpt.delete(root, handle_name, #"", mpt_proof)
    _ -> fail @"INVALID_AMOUNT"
  }
}

fn update_mint_value(
  mint_value: Value,
  policy_id: PolicyId,
  handle_name: ByteArray,
  is_virtual: Bool,
  amount: Int,
) -> Value {
  if is_virtual {
    mint_value
      |> value.add(policy_id, bytearray.concat(prefix_000, handle_name), amount)
  } else {
    mint_value
      |> value.add(policy_id, bytearray.concat(prefix_100, handle_name), amount)
      |> value.add(policy_id, bytearray.concat(prefix_222, handle_name), amount)
  }
}

pub fn calculate_treasury_fee_and_minter_fee(
  total_handles_price: Int,
  treasury_fee_percentage: Int,
) -> (Int, Int) {
  expect treasury_fee_percentage >= 0
  expect treasury_fee_percentage <= 100

  let treasury_fee =
    math.max(
      total_handles_price * treasury_fee_percentage / 100,
      min_treasury_fee,
    )
  let minter_fee = total_handles_price - treasury_fee
  (treasury_fee, minter_fee)
}
