use aiken/collection/pairs
use cardano/address.{Credential, Script}
use common/hashes.{ScriptHash}

pub fn is_withdrawal_script_executed(
  withdrawals: Pairs<Credential, Int>,
  script_hash: ScriptHash,
) -> Bool {
  pairs.has_key(withdrawals, Script(script_hash))
}

pub fn parse_bool_from_int(value: Int) -> Bool {
  when value is {
    0 -> False
    1 -> True
    _ -> fail @"Invalid bool value"
  }
}
