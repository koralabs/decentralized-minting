use aiken/transaction.{OutputReference, Transaction}
use common/utils.{
  get_own_utxo, get_own_utxos_count, get_script_hash_from_utxo,
  is_withdrawal_script_executed,
}
use decentralized_minting/orders.{OrderDatum}
use decentralized_minting/settings.{Settings, find_settings}
use sundae/multisig

// Validation:
// When minting engine mints Handles (new or legacy),
// they spend Order UTxOs from `orders` validator
//
// Checks:
// - must have `Settings` in reference inputs.
// - `mint_governor` withdrawal validatoris executed.
//
pub fn can_execute_orders(transaction: Transaction) -> Bool {
  let Transaction { reference_inputs, withdrawals, .. } = transaction

  // must have `Settings` in reference inputs.
  let Settings { mint_governor, .. } = find_settings(reference_inputs)

  // `mint_governor` withdrawal validatoris executed.
  let is_mint_governor_executed =
    is_withdrawal_script_executed(withdrawals, mint_governor)

  is_mint_governor_executed
}

// Validation:
// When an user cancels his Order.
//
// Checks:
// - transaction must be satisfied by `owner` from `OrderDatum`.
//   `owner` must be type of `multisig.MultisigScript`.
// - there must be only one UTxO in transaction inputs from this script.
//
pub fn can_cancel_order(
  transaction: Transaction,
  datum: OrderDatum,
  spending_output_reference: OutputReference,
) -> Bool {
  let Transaction { extra_signatories, validity_range, withdrawals, inputs, .. } =
    transaction

  // `owner` must be type of `multisig.MultisigScript`.
  expect owner: multisig.MultisigScript = datum.owner

  // transaction must be satisfied by `owner` from `OrderDatum`.
  let is_satisfied =
    multisig.satisfied(owner, extra_signatories, validity_range, withdrawals)
  expect is_satisfied

  // there must be only one UTxO in transaction inputs from this script.
  let own_script_hash =
    get_own_utxo(inputs, spending_output_reference) |> get_script_hash_from_utxo
  let own_utxo_count = get_own_utxos_count(inputs, own_script_hash)
  expect own_utxo_count == 1

  True
}
