use aiken/bytearray
use validations/minting_data/types.{
  LegacyHandle, LegacySubHandle, LegacyVirtualSubHandle, NewHandle,
}
use validations/minting_data/utils.{is_handle_valid}

test is_handle_valid_0() {
  let handle = NewHandle(bytearray.from_string(@"abc"))
  is_handle_valid(handle)
}

test is_handle_valid_1() fail {
  let handle = NewHandle(bytearray.from_string(@"abc@abc"))
  is_handle_valid(handle)
}

test is_handle_valid_2() fail {
  let handle = NewHandle(bytearray.from_string(@"abcdefghijklmnop"))
  is_handle_valid(handle)
}

test is_handle_valid_3() {
  let handle = LegacyHandle(bytearray.from_string(@"abc"))
  is_handle_valid(handle)
}

test is_handle_valid_4() fail {
  let handle = LegacyHandle(bytearray.from_string(@"abc@abc"))
  is_handle_valid(handle)
}

test is_handle_valid_5() fail {
  let handle = LegacyHandle(bytearray.from_string(@"abcdefghijklmnop"))
  is_handle_valid(handle)
}

test is_handle_valid_6() {
  let handle =
    LegacySubHandle(
      bytearray.from_string(@"abc@abc"),
      bytearray.from_string(@"abc"),
    )
  is_handle_valid(handle)
}

test is_handle_valid_7() fail {
  let handle =
    LegacySubHandle(
      bytearray.from_string(@"abc@abc"),
      bytearray.from_string(@"cba"),
    )
  is_handle_valid(handle)
}

test is_handle_valid_8() fail {
  let handle =
    LegacySubHandle(
      bytearray.from_string(@"abc@a@b"),
      bytearray.from_string(@"a@b"),
    )
  is_handle_valid(handle)
}

test is_handle_valid_9() fail {
  let handle =
    LegacySubHandle(
      bytearray.from_string(@"abcdefhijklmnopqrstuvwxyz@abc"),
      bytearray.from_string(@"abc"),
    )
  is_handle_valid(handle)
}

test is_handle_valid_10() {
  let handle =
    LegacyVirtualSubHandle(
      bytearray.from_string(@"abc@abc"),
      bytearray.from_string(@"abc"),
    )
  is_handle_valid(handle)
}

test is_handle_valid_11() fail {
  let handle =
    LegacyVirtualSubHandle(
      bytearray.from_string(@"abc@abc"),
      bytearray.from_string(@"cba"),
    )
  is_handle_valid(handle)
}

test is_handle_valid_12() fail {
  let handle =
    LegacyVirtualSubHandle(
      bytearray.from_string(@"abc@a@b"),
      bytearray.from_string(@"a@b"),
    )
  is_handle_valid(handle)
}

test is_handle_valid_13() fail {
  let handle =
    LegacyVirtualSubHandle(
      bytearray.from_string(@"abcdefhijklmnopqrstuvwxyz@abc"),
      bytearray.from_string(@"abc"),
    )
  is_handle_valid(handle)
}
