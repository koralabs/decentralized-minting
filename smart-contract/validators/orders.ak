use aiken/transaction.{ScriptContext, Spend}
use decentralized_minting/orders.{OrderDatum}
use validations/orders/validation.{can_cancel_order, can_execute_orders}

type OrderRedeemer {
  ExecuteOrders
  CancelOrder
}

// This is Spending validator
// Where Order UTxO is sent
// with OrderDatum and enough lovelace to pay
//
// ===== Parameters =====
// `randomizer`: Random bytearray to make validator hash random
//
validator(_randomizer: ByteArray) {
  fn spend(
    datum: OrderDatum,
    redeemer: OrderRedeemer,
    ctx: ScriptContext,
  ) -> Bool {
    let ScriptContext(transaction, purpose) = ctx
    expect Spend(spending_output_reference) = purpose

    when redeemer is {
      ExecuteOrders -> can_execute_orders(transaction)
      CancelOrder ->
        can_cancel_order(transaction, datum, spending_output_reference)
    }
  }
}
