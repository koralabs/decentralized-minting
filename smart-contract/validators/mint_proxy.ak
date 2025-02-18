use aiken/pairs
use aiken/transaction.{ScriptContext}
use aiken/transaction/credential.{Inline, ScriptCredential}
use decentralized_minting/settings/types.{Settings}
use decentralized_minting/settings/utils.{find_settings}

validator {
  pub fn mint(_r: Data, ctx: ScriptContext) {
    let (_, Settings { mint_governor, .. }) =
      find_settings(ctx.transaction.inputs)
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
