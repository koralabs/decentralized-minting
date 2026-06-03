use aiken/transaction.{ScriptContext, Spend}
use decentralized_minting/orders.{
  Cancel, Execute, OrderDatum, OrderRedeemer, Refund,
}
use validations/orders/validation.{
  can_cancel_order, can_execute_order, can_refund_order,
}

validator {
  fn spend(
    datum: OrderDatum,
    redeemer: OrderRedeemer,
    ctx: ScriptContext,
  ) -> Bool {
    let ScriptContext(transaction, purpose) = ctx
    expect Spend(order_output_reference) = purpose

    when redeemer is {
      Execute -> can_execute_order(transaction)
      Cancel -> can_cancel_order(transaction, datum)
      Refund -> can_refund_order(transaction, order_output_reference, datum)
    }
  }
}
