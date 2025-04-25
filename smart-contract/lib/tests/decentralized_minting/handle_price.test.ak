use decentralized_minting/handle_price.{
  get_handle_price, resolve_handle_price_info,
}
use tests/mocks/fake_constants.{
  valid_handle_price_asset_0, valid_handle_price_asset_1,
}
use tests/mocks/fake_tx.{make_handle_price_info_output}

test get_handle_price_0() {
  let asset = valid_handle_price_asset_0()
  let handle_price_info_output = make_handle_price_info_output(asset)
  let handle_price_info =
    resolve_handle_price_info(handle_price_info_output, asset)
  let (current_price, prev_price) = get_handle_price(handle_price_info, 15)
  and {
    current_price == 10_000_000,
    prev_price == 5_000_000,
  }
}

test get_handle_price_1() fail {
  let asset = valid_handle_price_asset_0()
  let other_asset = valid_handle_price_asset_1()
  let handle_price_info_output = make_handle_price_info_output(asset)
  let handle_price_info =
    resolve_handle_price_info(handle_price_info_output, other_asset)
  let (current_price, prev_price) = get_handle_price(handle_price_info, 15)
  and {
    current_price == 10_000_000,
    prev_price == 5_000_000,
  }
}
