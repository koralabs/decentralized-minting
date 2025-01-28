use aiken/list
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/value.{PolicyId}
use handle/types.{Settings}

const settings_nft_name = "ADA Handle Settings"

pub fn find_settings_datum(
  inputs: List<Input>,
  settings_policy_id: PolicyId,
) -> (Output, Settings) {
  expect Some(settings_output) =
    list.find(
      inputs,
      fn(i) {
        value.quantity_of(i.output.value, settings_policy_id, settings_nft_name) == 1
      },
    )
  expect InlineDatum(settings_datum) = settings_output.output.datum
  expect settings_datum: Settings = settings_datum
  (settings_output.output, settings_datum)
}
