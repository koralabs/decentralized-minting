use aiken/bytearray
use common/handle.{parse_handle_name}

test parse_handle_name_0() {
  (#"", False) == parse_handle_name(bytearray.from_string(@"abc"))
}

test parse_handle_name_1() {
  (bytearray.from_string(@"abc"), True) == parse_handle_name(
    bytearray.from_string(@"abc@abc"),
  )
}

test parse_handle_name_2() {
  (#"", True) == parse_handle_name(bytearray.from_string(@"@"))
}

test parse_handle_name_3() {
  (#"", True) == parse_handle_name(bytearray.from_string(@"abc@"))
}

test parse_handle_name_4() {
  (bytearray.from_string(@"abc"), True) == parse_handle_name(
    bytearray.from_string(@"@abc"),
  )
}

test parse_handle_name_5() {
  (#"", False) == parse_handle_name(bytearray.from_string(@""))
}

test parse_handle_name_6() fail {
  (bytearray.from_string(@"abc@abc"), True) == parse_handle_name(
    bytearray.from_string(@"abc@abc@abc"),
  )
}
