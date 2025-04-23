use aiken/list
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/value.{AssetName, PolicyId}

// This is the list of handles price
// There are 4 handle prices (ultraRare, rare, common, basic)
// NOTE:
// this handle price info is attached to authorized assets
// meaning that we assume Pairs are in ascending order
// e.g.,
// [
//   2_000_000_000, // ultraRare: 2_000 ada
//   500_000_000, // rare: 500 ada
//   100_000_000, // common: 100 ada
//   10_000_000, // basic: 10 ada
// ]
//
pub type HandlePriceInfo {
  current_data: List<Int>,
  prev_data: List<Int>,
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
  let HandlePriceInfo { current_data, prev_data, .. } = handle_price_info

  let current_price =
    get_handle_price_from_price_data(handle_length, current_data)
  let prev_price = get_handle_price_from_price_data(handle_length, prev_data)
  (current_price, prev_price)
}

fn get_handle_price_from_price_data(
  handle_length: Int,
  price_table: List<Int>,
) -> Int {
  // parse price data (there are 4 price data)
  expect [ultra_rare, rare, common, basic] = price_table

  if handle_length <= 2 {
    ultra_rare
  } else if handle_length == 3 {
    rare
  } else if handle_length == 7 {
    common
  } else {
    basic
  }
}
