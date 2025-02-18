use aiken/transaction.{ScriptContext}
use decentralized_minting/orders/types.{
  Cancel, Execute, OrderDatum, OrderRedeemer,
}
use decentralized_minting/settings/utils.{is_mint_governor_executed}
use sundae/multisig

validator {
  pub fn spend(
    datum: OrderDatum,
    redeemer: OrderRedeemer,
    ctx: ScriptContext,
  ) -> Bool {
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
      Execute -> is_mint_governor_executed(ctx.transaction)
    }
  }
}
