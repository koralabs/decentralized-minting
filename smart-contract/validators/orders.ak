use aiken/list
use aiken/transaction.{ScriptContext, Spend, Transaction}
use aiken/transaction/value.{PolicyId}
use common/utils.{is_withdrawal_script_executed}
use decentralized_minting/orders.{
  Cancel, ExecuteAsLegacy, ExecuteAsNew, OrderDatum, OrderRedeemer,
}
use decentralized_minting/settings.{Settings, find_settings}
use sundae/multisig

validator(legacy_policy_id: PolicyId) {
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
        mint,
        ..
      },
      purpose,
    ) = ctx
    expect Spend(_) = purpose

    when redeemer is {
      ExecuteAsNew -> {
        let Settings { mint_governor, .. } = find_settings(reference_inputs)
        is_withdrawal_script_executed(withdrawals, mint_governor)
      }
      ExecuteAsLegacy ->
        // check legacy policy id is minted
        value.from_minted_value(mint)
          |> value.policies
          |> list.has(legacy_policy_id)
      Cancel -> {
        expect owner: multisig.MultisigScript = datum.owner
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
