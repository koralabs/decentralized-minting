use aiken/pairs
use aiken/transaction.{ScriptContext}
use aiken/transaction/value.{PolicyId}
use aiken/transaction/credential.{ScriptCredential, Inline}
use utils.{find_settings_datum}
use handle/types.{Settings}

validator(settings_policy: PolicyId) {
    pub fn mint(_r: Data, ctx: ScriptContext) {
        let (_, Settings { mint_governor, .. }) = find_settings_datum(ctx.transaction.inputs, settings_policy)
        pairs.foldl(
            ctx.transaction.withdrawals,
            False,
            fn(withdrawal, _amt, acc) {
                when withdrawal is {
                Inline(ScriptCredential(script)) ->
                    acc || script == mint_governor
                _ -> acc
                }
            },
        )
    }
}
