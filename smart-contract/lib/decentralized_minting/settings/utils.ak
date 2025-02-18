use aiken/list
use aiken/pairs
use aiken/transaction.{InlineDatum, Input, Output, Transaction}
use aiken/transaction/credential.{Inline, ScriptCredential}
use aiken/transaction/value
use decentralized_minting/constants.{
  legacy_handle_policy_id, settings_asset_name,
}
use decentralized_minting/settings/types.{Settings}

pub fn find_settings(inputs: List<Input>) -> (Output, Settings) {
  expect Some(settings_input) =
    list.find(
      inputs,
      fn(i) {
        value.quantity_of(
          i.output.value,
          legacy_handle_policy_id,
          settings_asset_name,
        ) == 1
      },
    )
  expect InlineDatum(settings_datum) = settings_input.output.datum
  expect settings_datum: Settings = settings_datum
  (settings_input.output, settings_datum)
}

pub fn is_mint_governor_executed(transaction: Transaction) -> Bool {
  let Transaction { withdrawals, inputs, .. } = transaction
  let (_, Settings { mint_governor, .. }) = find_settings(inputs)

  pairs.foldl(
    withdrawals,
    False,
    fn(withdrawal, _amt, acc) {
      when withdrawal is {
        Inline(ScriptCredential(script)) -> acc || script == mint_governor
        _ -> acc
      }
    },
  )
}
