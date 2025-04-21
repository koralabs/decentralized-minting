use aiken/list
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/value

const handle_price_info_asset_policy_id =
  #"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"

// price@handle_settings
// hold handle price info
// This will be updated regularly
//
const handle_price_info_asset_name =
  #"000de14070726963654068616e646c655f73657474696e6773"

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
) -> HandlePriceInfo {
  expect Some(handle_price_info_input) =
    list.at(reference_inputs, handle_price_info_index)
  let handle_price_info_output = handle_price_info_input.output
  let output_has_handle_price_info_asset =
    value.quantity_of(
      handle_price_info_output.value,
      handle_price_info_asset_policy_id,
      handle_price_info_asset_name,
    ) == 1
  expect output_has_handle_price_info_asset

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
