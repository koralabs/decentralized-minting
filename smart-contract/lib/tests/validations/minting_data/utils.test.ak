use tests/mocks/fake_tx.{make_handle_price_info}
use validations/minting_data/utils.{check_new_handle_validity_and_get_price}

test check_new_handle_validity_and_get_price_0() {
  let handle_price_info = make_handle_price_info()
  let handle_name = "a"
  let handle_price =
    check_new_handle_validity_and_get_price(handle_name, handle_price_info)
  handle_price == 1_000_000_000
}

test check_new_handle_validity_and_get_price_1() {
  let handle_price_info = make_handle_price_info()
  let handle_name = "ab"
  let handle_price =
    check_new_handle_validity_and_get_price(handle_name, handle_price_info)
  handle_price == 1_000_000_000
}

test check_new_handle_validity_and_get_price_2() {
  let handle_price_info = make_handle_price_info()
  let handle_name = "abc"
  let handle_price =
    check_new_handle_validity_and_get_price(handle_name, handle_price_info)
  handle_price == 500_000_000
}

test check_new_handle_validity_and_get_price_3() {
  let handle_price_info = make_handle_price_info()
  let handle_name = "abcd"
  let handle_price =
    check_new_handle_validity_and_get_price(handle_name, handle_price_info)
  handle_price == 80_000_000
}

test check_new_handle_validity_and_get_price_4() {
  let handle_price_info = make_handle_price_info()
  let handle_name = "abcde"
  let handle_price =
    check_new_handle_validity_and_get_price(handle_name, handle_price_info)
  handle_price == 80_000_000
}

test check_new_handle_validity_and_get_price_5() {
  let handle_price_info = make_handle_price_info()
  let handle_name = "abcdef"
  let handle_price =
    check_new_handle_validity_and_get_price(handle_name, handle_price_info)
  handle_price == 80_000_000
}

test check_new_handle_validity_and_get_price_6() {
  let handle_price_info = make_handle_price_info()
  let handle_name = "abcdefg"
  let handle_price =
    check_new_handle_validity_and_get_price(handle_name, handle_price_info)
  handle_price == 80_000_000
}

test check_new_handle_validity_and_get_price_7() {
  let handle_price_info = make_handle_price_info()
  let handle_name = "abcdefgh"
  let handle_price =
    check_new_handle_validity_and_get_price(handle_name, handle_price_info)
  handle_price == 5_000_000
}

test check_new_handle_validity_and_get_price_8() {
  let handle_price_info = make_handle_price_info()
  let handle_name = "abcdefghi"
  let handle_price =
    check_new_handle_validity_and_get_price(handle_name, handle_price_info)
  handle_price == 5_000_000
}

test check_new_handle_validity_and_get_price_9() {
  let handle_price_info = make_handle_price_info()
  let handle_name = "abcdefghij"
  let handle_price =
    check_new_handle_validity_and_get_price(handle_name, handle_price_info)
  handle_price == 5_000_000
}

test check_new_handle_validity_and_get_price_10() {
  let handle_price_info = make_handle_price_info()
  let handle_name = "abcdefghijk"
  let handle_price =
    check_new_handle_validity_and_get_price(handle_name, handle_price_info)
  handle_price == 5_000_000
}
