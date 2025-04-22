use aiken/fuzz
use common/utils.{parse_bool_from_int}

test parse_bool_from_int_0() {
  False == parse_bool_from_int(0)
}

test parse_bool_from_int_1() {
  True == parse_bool_from_int(1)
}

test parse_bool_from_int_negative() fail {
  parse_bool_from_int(-1)
}

test parse_bool_from_int_2() fail {
  parse_bool_from_int(2)
}

test parse_bool_from_int_large() fail {
  parse_bool_from_int(100)
}

test parse_bool_from_int_prop_false(zero via fuzz.int_between(0, 0)) {
  False == parse_bool_from_int(zero)
}

test parse_bool_from_int_prop_true(one via fuzz.int_between(1, 1)) {
  True == parse_bool_from_int(one)
}
