use aiken/transaction.{ScriptContext, WithdrawFrom}
use handle/types.{SettingsV1}

validator {
  fn stake(_r: Data, ctx: ScriptContext) -> Bool {
    when ctx.purpose is {
      WithdrawFrom(_) -> True
      _ -> False
    }
  }

  fn documentation(_datum: SettingsV1, _r: Data, _ctx: ScriptContext) -> Bool {
    False
  }
}
