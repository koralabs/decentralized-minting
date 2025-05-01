use aiken/transaction.{ScriptContext, Spend, Transaction}
use common/utils.{is_withdrawal_script_executed}
use decentralized_minting/orders.{Cancel, Execute, OrderDatum, OrderRedeemer}
use decentralized_minting/settings.{Settings, find_settings}
use sundae/multisig.{MultisigScript}

validator {
  fn spend(
    datum: OrderDatum,
    redeemer: OrderRedeemer,
    ctx: ScriptContext,
  ) -> Bool {
    let ScriptContext(
      Transaction {
        reference_inputs,
        extra_signatories,
        validity_range,
        withdrawals,
        ..
      },
      purpose,
    ) = ctx
    expect Spend(_) = purpose

    when redeemer is {
      Execute -> {
        let Settings { mint_governor, .. } = find_settings(reference_inputs)
        is_withdrawal_script_executed(withdrawals, mint_governor)
      }
      Cancel -> {
        expect owner: MultisigScript = datum.owner
        // Defer to sundae.multisig
        multisig.satisfied(
          owner,
          extra_signatories,
          validity_range,
          withdrawals,
        )
      }
    }
  }
}
