use aiken/pairs
use aiken/transaction.{ScriptContext}
use aiken/transaction/credential.{Inline, ScriptCredential}
use aiken/transaction/value.{PolicyId}
use handle/types.{Settings}
use utils.{find_settings_datum}

validator(settings_policy: PolicyId) {
  pub fn mint(_r: Data, ctx: ScriptContext) {
    let (_, Settings { mint_governor, .. }) =
      find_settings_datum(ctx.transaction.inputs, settings_policy)
    pairs.foldl(
      ctx.transaction.withdrawals,
      False,
      fn(withdrawal, _amt, acc) {
        when withdrawal is {
          Inline(ScriptCredential(script)) -> acc || script == mint_governor
          _ -> acc
        }
      },
    )
  }
}
