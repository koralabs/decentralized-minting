use aiken/list
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/value
use decentralized_minting/constants.{
  handles_mpt_root_asset_name, legacy_handle_policy_id,
}

pub type MintingData {
  // mpt root hash
  mpt_root_hash: ByteArray,
}

pub fn find_minting_data(inputs: List<Input>) -> (Output, MintingData) {
  expect Some(minting_data_input) =
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
  expect InlineDatum(inline_minting_data) = minting_data_input.output.datum
  expect minting_data: MintingData = inline_minting_data
  (minting_data_input.output, minting_data)
}
