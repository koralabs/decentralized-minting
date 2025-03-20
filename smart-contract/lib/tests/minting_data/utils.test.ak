use aiken/bytearray
use validations/minting_data/utils.{is_handle_valid, parse_handle_name}

test is_handle_valid_0() {
  is_handle_valid(bytearray.from_string(@"abc"), False)
}

test is_handle_valid_1() {
  and {
    is_handle_valid(bytearray.from_string(@"abc@abc"), False),
    is_handle_valid(bytearray.from_string(@"abc@abc"), True),
  }
}

test is_handle_valid_2() {
  and {
    is_handle_valid(bytearray.from_string(@"@"), False),
    is_handle_valid(bytearray.from_string(@"@"), True),
  }
}

test is_handle_valid_3() {
  and {
    is_handle_valid(bytearray.from_string(@"abc@"), False),
    is_handle_valid(bytearray.from_string(@"abc@"), True),
  }
}

test is_handle_valid_4() {
  and {
    is_handle_valid(bytearray.from_string(@"@abc"), False),
    is_handle_valid(bytearray.from_string(@"@abc"), True),
  }
}

test is_handle_valid_5() fail {
  is_handle_valid(bytearray.from_string(@"abcdefghijklmnop"), False)
}

test is_handle_valid_6() fail {
  is_handle_valid(
    bytearray.from_string(@"abcdefhijklmnopqrstuvwxyz@abc"),
    False,
  )
}

test is_handle_valid_7() fail {
  is_handle_valid(bytearray.from_string(@"abcdefhijklmnopqrstuvwxyz@abc"), True)
}

test is_handle_valid_8() fail {
  is_handle_valid(bytearray.from_string(@"abc@abcdefghijklmnop"), False)
}

test is_handle_valid_9() fail {
  is_handle_valid(bytearray.from_string(@"abc@abcdefghijklmnop"), True)
}

test is_handle_valid_10() fail {
  is_handle_valid(bytearray.from_string(@"abc"), True)
}

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
