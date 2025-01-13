use aiken/pairs
use aiken/transaction.{ScriptContext}
use aiken/transaction/value.{PolicyId}
use aiken/transaction/credential.{Inline, ScriptCredential}
use handle/types.{Settings, OrderRedeemer, OrderDatum, Cancel, Execute}
use sundae/multisig
use utils.{find_settings_datum}

validator(settings_policy: PolicyId) {
  pub fn spend(datum: OrderDatum, redeemer: OrderRedeemer, ctx: ScriptContext) -> Bool {
    when redeemer is {
      Cancel -> {
        expect owner: multisig.MultisigScript = datum.owner
        // Defer to sundae.multisig
        multisig.satisfied(
          owner,
          ctx.transaction.extra_signatories,
          ctx.transaction.validity_range,
          ctx.transaction.withdrawals,
        )
      }
      Execute -> {
        // Find the settings input
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
  }
}
