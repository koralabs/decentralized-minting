use aiken/list
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/value

// This is table of handle length and price
// key is handle length
// value is price
// NOTE:
// this handle price info is attached to authorized assets
// meaning that we assume Pairs are in ascending order
// e.g.,
// [
//   (2, 120_000_000), // ultraRare: 120 ada
//   (3, 80_000_000), // rare: 80 ada
//   (7, 50_000_000), // common: 50 ada
//   (15, 10_000_000), // basic: 10 ada
// ]
//
pub type HandlePriceInfo {
  prev_data: Pairs<Int, Int>,
  current_data: Pairs<Int, Int>,
  // UNIX timestamp
  updated_at: Int,
}

pub fn find_handle_price_info(
  reference_inputs: List<Input>,
  handle_price_info_index: Int,
  valid_handle_price_assets: List<(ByteArray, ByteArray)>,
) -> HandlePriceInfo {
  // get handle_price_info_input from index
  expect Some(handle_price_info_input) =
    list.at(reference_inputs, handle_price_info_index)
  // check output value has one of valid assets
  let handle_price_info_output = handle_price_info_input.output
  let has_valid_handle_price_asset =
    valid_handle_price_assets
      |> list.any(
          fn(valid_asset) {
            let (policy_id, asset_name) = valid_asset
            value.quantity_of(
              handle_price_info_output.value,
              policy_id,
              asset_name,
            ) == 1
          },
        )
  expect has_valid_handle_price_asset

  expect InlineDatum(inline_handle_price_info) = handle_price_info_output.datum
  expect handle_price_info: HandlePriceInfo = inline_handle_price_info
  handle_price_info
}

pub fn get_handle_price(
  handle_price_info: HandlePriceInfo,
  handle_length: Int,
) -> (Int, Int) {
  let HandlePriceInfo { prev_data, current_data, .. } = handle_price_info
  let current_price =
    get_handle_price_from_price_table(handle_length, current_data)
  let prev_price = get_handle_price_from_price_table(handle_length, prev_data)
  (current_price, prev_price)
}

fn get_handle_price_from_price_table(
  handle_length: Int,
  price_table: Pairs<Int, Int>,
) -> Int {
  when price_table is {
    [] -> fail @"INVALID_PRICE_TABLE"
    [Pair(length, price), ..rest] ->
      if handle_length <= length {
        price
      } else {
        get_handle_price_from_price_table(handle_length, rest)
      }
  }
}
