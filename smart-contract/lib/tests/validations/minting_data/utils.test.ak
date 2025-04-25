use tests/mocks/fake_tx.{make_handle_price_info}
use validations/minting_data/utils.{
  check_legacy_handle_validity, check_new_handle_validity_and_get_price,
}

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

test check_new_handle_validity_and_get_price_11() fail {
  let handle_price_info = make_handle_price_info()
  let handle_name = "abcde@abcde"
  let handle_price =
    check_new_handle_validity_and_get_price(handle_name, handle_price_info)
  handle_price == 5_000_000
}

test check_new_handle_validity_and_get_price_12() fail {
  let handle_price_info = make_handle_price_info()
  let handle_name = "abcdefghijklmnop"
  let handle_price =
    check_new_handle_validity_and_get_price(handle_name, handle_price_info)
  handle_price == 5_000_000
}

test check_new_handle_validity_and_get_price_13() fail {
  let handle_price_info = make_handle_price_info()
  let handle_name = ""
  let handle_price =
    check_new_handle_validity_and_get_price(handle_name, handle_price_info)
  handle_price == 1_000_000_000
}

test check_legacy_handle_validity_0() {
  and {
    check_legacy_handle_validity("abc", False),
    check_legacy_handle_validity("abc@abc", False),
    check_legacy_handle_validity("abc@abc", True),
  }
}

test check_legacy_handle_validity_1() fail {
  check_legacy_handle_validity("abc", True)
}

test check_legacy_handle_validity_2() fail {
  check_legacy_handle_validity("abcdefghijklmnop", False)
}

test check_legacy_handle_validity_3() fail {
  check_legacy_handle_validity("", False)
}

test check_legacy_handle_validity_4() fail {
  check_legacy_handle_validity("abc@", True)
}

test check_legacy_handle_validity_5() fail {
  check_legacy_handle_validity("@abc", True)
}

test check_legacy_handle_validity_6() fail {
  check_legacy_handle_validity("abcdefghijklm@abcdefghijklmno", True)
}

test check_legacy_handle_validity_7() fail {
  check_legacy_handle_validity("abc@abcdefghijklmnop", True)
}
