use aiken/transaction.{ScriptContext}
use decentralized_minting/settings/utils.{is_mint_governor_executed}

validator {
  pub fn mint(_r: Data, ctx: ScriptContext) {
    is_mint_governor_executed(ctx.transaction)
  }
}
