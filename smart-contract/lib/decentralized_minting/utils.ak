use aiken/list
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/value.{PolicyId}
use decentralized_minting/types.{Settings}

// (222) demi@handle_settings
const settings_nft_name = #"000de14064656d694068616e646c655f73657474696e6773"

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
