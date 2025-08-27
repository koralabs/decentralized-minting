use common/utils.{parse_int_to_bool}

test parse_int_to_bool_0() {
  False == parse_int_to_bool(0)
}

test parse_int_to_bool_1() {
  True == parse_int_to_bool(1)
}

test parse_int_to_bool_negative() fail {
  parse_int_to_bool(-1)
}

test parse_int_to_bool_2() fail {
  parse_int_to_bool(2)
}

test parse_int_to_bool_large() fail {
  parse_int_to_bool(100)
}
