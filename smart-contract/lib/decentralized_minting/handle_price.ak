use aiken/list
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/value.{AssetName, PolicyId}

// This is table of handle length and price
// key is handle length
// value is price
// NOTE:
// this handle price info is attached to authorized assets
// meaning that we assume Pairs are in ascending order
// e.g.,
// [
//   (2, 2_000_000_000), // ultraRare: 2_000 ada
//   (3, 500_000_000), // rare: 500 ada
//   (7, 100_000_000), // common: 100 ada
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
  valid_handle_price_asset: (PolicyId, AssetName),
) -> HandlePriceInfo {
  // get handle_price_info_input from index
  // check output value has one of valid assets
  expect Some(handle_price_info_input) =
    list.find(
      reference_inputs,
      fn(input) {
        let (policy_id, asset_name) = valid_handle_price_asset
        value.quantity_of(input.output.value, policy_id, asset_name) == 1
      },
    )

  let handle_price_info_output = handle_price_info_input.output
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
