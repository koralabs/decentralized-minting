use aiken/bytearray
use aiken/list
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/value.{PolicyId}
use common/cip68.{prefix_001}

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
//     buy_down_price: Int
//     buy_down_paid: Int
//     buy_down_percent: Int
//     agreed_terms: Data
//     migrate_sig_required: Int
//     payment_address: ByteArray
// }
type OwnerSettings =
  (SubHandleSettings, SubHandleSettings, Int, Int, Int, Data, Int, ByteArray)

pub fn get_root_handle_settings(
  reference_inputs: List<Input>,
  root_handle_settings_index: Int,
  root_handle_name: ByteArray,
  new_policy_id: PolicyId,
  legacy_policy_id: PolicyId,
) -> OwnerSettings {
  expect Some(reference_input) =
    list.at(reference_inputs, root_handle_settings_index)

  // check if reference input has root handle 001 NFT
  // root handle settings asset can be
  // either new policy id or legacy policy id
  // but must be only one
  let settings_asset_name = bytearray.concat(prefix_001, root_handle_name)
  let Input { output: Output { value: v, .. }, .. } = reference_input
  let quantity_if_new = value.quantity_of(v, new_policy_id, settings_asset_name)
  let quantity_if_legacy =
    value.quantity_of(v, legacy_policy_id, settings_asset_name)
  let root_handle_settings_asset_quantity = quantity_if_new + quantity_if_legacy
  expect root_handle_settings_asset_quantity == 1

  // parse datum
  expect InlineDatum(inline_datum) = reference_input.output.datum
  expect owner_settings: OwnerSettings = inline_datum
  owner_settings
}

//
// this function gets sub handle price
// from root handle owner settings
// when it is virtual or nft
// sub handle name is without root handle name
//
pub fn get_sub_handle_price(
  root_handle_settings: OwnerSettings,
  sub_handle_name: ByteArray,
  is_virtual: Bool,
) -> Int {
  let (nft_sub_handle_settings, virtual_sub_handle_settings, _, _, _, _, _, _) =
    root_handle_settings

  let sub_handle_settings =
    if is_virtual {
      virtual_sub_handle_settings
    } else {
      nft_sub_handle_settings
    }

  let (_, _, tier_pricing, _, _) = sub_handle_settings
  let sub_handle_length = bytearray.length(sub_handle_name)
  get_sub_handle_price_from_tier_pricing(tier_pricing, sub_handle_length)
}

fn get_sub_handle_price_from_tier_pricing(
  tier_pricing: List<(Int, Int)>,
  sub_handle_length: Int,
) -> Int {
  when tier_pricing is {
    [] -> fail @"INVALID_TIER_PRICING"
    [pricing, ..rest] -> {
      let (length, price) = pricing
      if sub_handle_length <= length {
        price
      } else {
        get_sub_handle_price_from_tier_pricing(rest, sub_handle_length)
      }
    }
  }
}
