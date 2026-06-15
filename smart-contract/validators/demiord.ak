use cardano/transaction.{OutputReference, Transaction}
use decentralized_minting/orders.{
  Cancel, Execute, OrderDatum, OrderRedeemer, Refund,
}
use validations/orders/validation.{
  can_cancel_order, can_execute_order, can_refund_order,
}

validator demiord {
  spend(
    datum: Option<OrderDatum>,
    redeemer: OrderRedeemer,
    order_output_reference: OutputReference,
    tx: Transaction,
  ) {
    expect Some(datum) = datum

    when redeemer is {
      Execute -> can_execute_order(tx)
      Cancel -> can_cancel_order(tx, datum)
      Refund -> can_refund_order(tx, order_output_reference, datum)
    }
  }

  else(_) {
    fail
  }
}
