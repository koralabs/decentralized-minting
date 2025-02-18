use aiken/list
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/value
use decentralized_minting/constants.{
  handles_mpt_root_asset_name, legacy_handle_policy_id,
}
use decentralized_minting/minting/types.{AllHandles}

pub fn find_handles_root(inputs: List<Input>) -> (Output, AllHandles) {
  expect Some(handles_root_input) =
    list.find(
      inputs,
      fn(i) {
        value.quantity_of(
          i.output.value,
          legacy_handle_policy_id,
          handles_mpt_root_asset_name,
        ) == 1
      },
    )
  expect InlineDatum(handles_root_datum) = handles_root_input.output.datum
  expect handles_root_datum: AllHandles = handles_root_datum
  (handles_root_input.output, handles_root_datum)
}
