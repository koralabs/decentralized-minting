use aiken/pairs
use aiken/transaction/credential.{Inline, ScriptCredential, StakeCredential}
use common/hashes.{ScriptHash}

pub fn is_withdrawal_script_executed(
  withdrawals: Pairs<StakeCredential, Int>,
  script_hash: ScriptHash,
) -> Bool {
  pairs.has_key(withdrawals, Inline(ScriptCredential(script_hash)))
}

pub fn parse_bool_from_int(value: Int) -> Bool {
  when value is {
    0 -> False
    1 -> True
    _ -> fail @"Invalid bool value"
  }
}
