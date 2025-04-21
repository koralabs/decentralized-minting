use aiken/bytearray
use aiken/list
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/value.{PolicyId}
use common/cip68.{prefix_001}

// sub handle settings struct
// helios-defined type
// struct SubHandleSettings {
//     public_minting_enabled: Bool
//     pz_enabled: Bool
//     tier_pricing: [][]Int
//     creator_defaults: Data
//     save_original_address: Int
// }

pub type SubHandleSettings =
  (Bool, Bool, List<List<Int>>, Data, Int)

// (001) token
// root handle settings
// helios-defined type
// struct OwnerSettings {
//     nft: SubHandleSettings
//     virtual: SubHandleSettings
//     buy_down_price: Int
//     buy_down_paid: Int
//     agreed_terms: Data
//     payment_address: ByteArray
//     migrate_sig_required: Int
// }
pub type OwnerSettings =
  (SubHandleSettings, SubHandleSettings, Int, Int, Data, ByteArray, Int)

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
// TODO:
// add functions to get sub handle price
// when it is virtual or nft
// from sub handle settings

//
// pub fn get_sub_handle_price(
//   root_handle_settings: OwnerSettings,
//   sub_handle_name: ByteArray,
//   is_virtual: Bool,
// ) -> Int {
//   let OwnerSettings(nft_sub_handle_settings, virtual_sub_handle_settings, ..) =
//     root_handle_settings

//   let sub_handle_settings =
//     if is_virtual {
//       virtual_sub_handle_settings
//     } else {
//       nft_sub_handle_settings
//     }
// }
