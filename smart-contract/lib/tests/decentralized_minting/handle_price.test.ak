use decentralized_minting/handle_price.{find_handle_price_info,
  get_handle_price}
use tests/mocks/fake_constants.{
  valid_handle_price_asset_0, valid_handle_price_asset_1,
}
use tests/mocks/fake_tx.{make_handle_price_info_reference_input}

test get_handle_price_0() {
  let asset = valid_handle_price_asset_0()
  let handle_price_info_reference_input =
    make_handle_price_info_reference_input(asset)
  let handle_price_info =
    find_handle_price_info([handle_price_info_reference_input], asset)
  let (current_price, prev_price) = get_handle_price(handle_price_info, 15)
  current_price == 10_000_000 && prev_price == 5_000_000
}

// too long
test get_handle_price_1() fail {
  let asset = valid_handle_price_asset_0()
  let handle_price_info_reference_input =
    make_handle_price_info_reference_input(asset)
  let handle_price_info =
    find_handle_price_info([handle_price_info_reference_input], asset)
  let (current_price, prev_price) = get_handle_price(handle_price_info, 20)
  current_price == 10_000_000 && prev_price == 5_000_000
}

// handle length is 0
test get_handle_price_2() fail {
  let asset = valid_handle_price_asset_0()
  let handle_price_info_reference_input =
    make_handle_price_info_reference_input(asset)
  let handle_price_info =
    find_handle_price_info([handle_price_info_reference_input], asset)
  let (current_price, prev_price) = get_handle_price(handle_price_info, 0)
  current_price == 10_000_000 && prev_price == 5_000_000
}

test get_handle_price_3() fail {
  let asset = valid_handle_price_asset_0()
  let other_asset = valid_handle_price_asset_1()
  let handle_price_info_reference_input =
    make_handle_price_info_reference_input(asset)
  let handle_price_info =
    find_handle_price_info([handle_price_info_reference_input], other_asset)
  let (current_price, prev_price) = get_handle_price(handle_price_info, 15)
  current_price == 10_000_000 && prev_price == 5_000_000
}
