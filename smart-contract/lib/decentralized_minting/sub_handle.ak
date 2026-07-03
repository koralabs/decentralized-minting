use aiken/builtin
use aiken/collection/list
use aiken/primitive/bytearray
use cardano/address.{Credential, Script, VerificationKey}
use cardano/assets.{PolicyId} as value
use cardano/transaction.{InlineDatum, Input, Output}
use common/cip68.{prefix_001}

// Extract the payment credential embedded in a raw Cardano address (the OwnerSettings
// `payment_address` bytes): byte 0 is the header — its bit 4 (0x10) flags a script vs key
// payment credential — and bytes 1..28 are the 28-byte credential hash. Used to verify an
// output pays the root owner's fee without parsing the full address (the stake part is
// irrelevant to who controls the funds).
pub fn owner_payment_credential(payment_address: ByteArray) -> Credential {
  let header = builtin.index_bytearray(payment_address, 0)
  let cred_hash = bytearray.slice(payment_address, 1, 28)
  if header / 16 % 2 == 1 {
    Script(cred_hash)
  } else {
    VerificationKey(cred_hash)
  }
}

// struct SubHandleSettings {
//     public_minting_enabled: Int
//     pz_enabled: Int
//     tier_pricing: [][]Int
//     default_styles: Data
//     save_original_address: Int
// }
type SubHandleSettings =
  (Int, Int, List<(Int, Int)>, Data, Int)

// struct OwnerSettings {
//     nft: SubHandleSettings
//     virtual: SubHandleSettings
//     reserved_0: Int          // RESERVED — formerly buy_down_price (never implemented, removed)
//     reserved_1: Int          // RESERVED — formerly buy_down_paid
//     reserved_2: Int          // RESERVED — formerly buy_down_percent
//     agreed_terms: Data
//     migrate_sig_required: Int
//     payment_address: ByteArray   // raw Cardano address bytes; owner fee is paid here
// }
// NOTE: the three reserved Ints keep the on-chain datum arity stable so existing 001 settings
// keep decoding — buy-down was never implemented and carries no logic anywhere.
type OwnerSettings =
  (SubHandleSettings, SubHandleSettings, Int, Int, Int, Data, Int, ByteArray)

pub fn get_root_handle_settings(
  reference_inputs: List<Input>,
  root_handle_settings_index: Int,
  root_handle_name: ByteArray,
  new_policy_id: PolicyId,
  legacy_policy_id: PolicyId,
) -> OwnerSettings {
  expect Some(reference_input) = list.at(
    reference_inputs,
    root_handle_settings_index,
  )

  // check if reference input has root handle 001 NFT
  // root handle settings asset can be
  // either new policy id or legacy policy id
  // but must be only one
  let settings_asset_name = bytearray.concat(prefix_001, root_handle_name)
  let Input { output: Output { value: v, .. }, .. } = reference_input
  let quantity_if_new = value.quantity_of(v, new_policy_id, settings_asset_name)
  let quantity_if_legacy = value.quantity_of(
    v,
    legacy_policy_id,
    settings_asset_name,
  )
  let root_handle_settings_asset_quantity = quantity_if_new + quantity_if_legacy
  expect root_handle_settings_asset_quantity == 1

  // parse datum
  expect InlineDatum(inline_datum) = reference_input.output.datum
  expect owner_settings: OwnerSettings = inline_datum
  owner_settings
}

// WS4 — locate a root handle's OwnerSettings by searching the reference inputs for its 001
// settings token (under the new or legacy policy). Unlike `get_root_handle_settings` (index
// based), this scans, so the caller needn't thread a per-proof index. Fails if not referenced.
pub fn find_root_handle_settings(
  reference_inputs: List<Input>,
  root_handle_name: ByteArray,
  new_policy_id: PolicyId,
  legacy_policy_id: PolicyId,
) -> OwnerSettings {
  let settings_asset_name = bytearray.concat(prefix_001, root_handle_name)
  when reference_inputs is {
    [] -> fail @"ROOT_HANDLE_SETTINGS_NOT_REFERENCED"
    [ref_input, ..rest] -> {
      let Input { output: Output { value: v, datum, .. }, .. } = ref_input
      let has_settings = value.quantity_of(
        v,
        new_policy_id,
        settings_asset_name,
      ) + value.quantity_of(v, legacy_policy_id, settings_asset_name) == 1
      if has_settings {
        expect InlineDatum(inline_datum) = datum
        expect owner_settings: OwnerSettings = inline_datum
        owner_settings
      } else {
        find_root_handle_settings(
          rest,
          root_handle_name,
          new_policy_id,
          legacy_policy_id,
        )
      }
    }
  }
}

//
// this function gets sub handle price
// from root handle owner settings
// when it is virtual or nft
// sub handle name is without root handle name
//
pub fn get_sub_handle_price(
  root_handle_settings: OwnerSettings,
  sub_handle_length: Int,
  is_virtual: Bool,
) -> Int {
  let (nft_sub_handle_settings, virtual_sub_handle_settings, _, _, _, _, _, _) = root_handle_settings

  let sub_handle_settings = if is_virtual {
    virtual_sub_handle_settings
  } else {
    nft_sub_handle_settings
  }

  let (_, _, tier_pricing, _, _) = sub_handle_settings
  get_sub_handle_price_from_tier_pricing(tier_pricing, sub_handle_length)
}

pub fn get_sub_handle_price_from_tier_pricing(
  tier_pricing: List<(Int, Int)>,
  sub_handle_length: Int,
) -> Int {
  // The owner's tier price may legitimately be 0 (a free subhandle, e.g. the
  // handlecontract deployment subhandles or any zero-priced root tier). We do
  // NOT require price > 0 here — the owner royalty is simply 0 in that case, and
  // the flat minter/treasury fees (enforced separately) still apply. A `price > 0`
  // assertion here would wrongly block every zero-priced subhandle.
  do_get_sub_handle_price_from_tier_pricing(tier_pricing, sub_handle_length, 0)
}

fn do_get_sub_handle_price_from_tier_pricing(
  tier_pricing: List<(Int, Int)>,
  sub_handle_length: Int,
  prev_tier_price: Int,
) -> Int {
  when tier_pricing is {
    [] -> prev_tier_price
    [pricing, ..rest] -> {
      let (length, price) = pricing
      if sub_handle_length < length {
        prev_tier_price
      } else {
        do_get_sub_handle_price_from_tier_pricing(
          rest,
          sub_handle_length,
          price,
        )
      }
    }
  }
}
