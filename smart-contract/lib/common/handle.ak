use aiken/builtin
use aiken/primitive/bytearray

// parse handle name
// get root handle name and is sub handle and sub handle name
// sub handle name is empty when it is not sub handle
pub fn parse_handle_name(handle_name: ByteArray) -> (ByteArray, Bool, ByteArray) {
  when index_of_at_symbol(handle_name) is {
    Some(idx) -> {
      // if handle_name contains @ symbol, it is a sub handle
      let root_handle_name = bytearray.drop(handle_name, idx + 1)
      // root_handle_name should not contain @ symbol
      expect index_of_at_symbol(root_handle_name) == None
      // sub handle name is [0, idx)
      let sub_handle_name = bytearray.take(handle_name, idx)
      (root_handle_name, True, sub_handle_name)
    }
    None -> (#"", False, #"")
  }
}

// On-chain charset gate for a handle PART (root or sub, no `@`): every byte must be
// 0-9 (0x30-0x39), a-z (0x61-0x7a), `_` (0x5f), `.` (0x2e), or `-` (0x2d). The minting
// validators previously enforced only LENGTH and trusted the off-chain engine for the
// charset; this makes a malformed-charset handle unmintable even if the engine is bypassed.
pub fn is_valid_handle_charset(name: ByteArray) -> Bool {
  do_is_valid_handle_charset(name, 0, bytearray.length(name))
}

fn do_is_valid_handle_charset(name: ByteArray, idx: Int, length: Int) -> Bool {
  if idx >= length {
    True
  } else {
    let b = builtin.index_bytearray(name, idx)
    if or {
      b >= 0x30 && b <= 0x39,
      b >= 0x61 && b <= 0x7a,
      b == 0x5f,
      b == 0x2e,
      b == 0x2d,
    } {
      do_is_valid_handle_charset(name, idx + 1, length)
    } else {
      False
    }
  }
}

test charset_accepts_lowercase_digits_specials() {
  is_valid_handle_charset("abc-123_x.y") && is_valid_handle_charset("a") && is_valid_handle_charset(
    "0",
  )
}

test charset_rejects_uppercase() {
  !is_valid_handle_charset("Abc") && !is_valid_handle_charset("handleX")
}

test charset_rejects_at_and_other_specials() {
  !is_valid_handle_charset("a@b") && !is_valid_handle_charset("a!b") && !is_valid_handle_charset(
    "a b",
  ) && !is_valid_handle_charset("a/b")
}

fn index_of_at_symbol(handle_name: ByteArray) -> Option<Int> {
  let length = bytearray.length(handle_name)
  do_index_of_at_symbol(handle_name, 0, length)
}

fn do_index_of_at_symbol(
  handle_name: ByteArray,
  idx: Int,
  length: Int,
) -> Option<Int> {
  if idx >= length {
    None
  } else {
    if builtin.index_bytearray(handle_name, idx) == 0x40 {
      Some(idx)
    } else {
      do_index_of_at_symbol(handle_name, idx + 1, length)
    }
  }
}
