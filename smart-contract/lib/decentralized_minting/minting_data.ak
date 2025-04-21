use aiken/list
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/value

const minting_data_asset_policy_id =
  #"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"

// handle_root@handle_settings
// hold minting data like mpt root hash and price
// NOTE: 
// must be spent every time 
// a new handle is minted
const minting_data_asset_name =
  #"000de14068616e646c655f726f6f744068616e646c655f73657474696e6773"

pub type MintingData {
  // mpt root hash
  mpt_root_hash: ByteArray,
}

pub fn find_minting_data(
  inputs: List<Input>,
  minting_data_index: Int,
) -> (Output, MintingData) {
  expect Some(minting_data_input) = list.at(inputs, minting_data_index)
  let minting_data_output = minting_data_input.output
  expect
    value.quantity_of(
      minting_data_output.value,
      minting_data_asset_policy_id,
      minting_data_asset_name,
    ) == 1

  expect InlineDatum(inline_minting_data) = minting_data_output.datum
  expect minting_data: MintingData = inline_minting_data
  (minting_data_output, minting_data)
}

// this function also makes sure that
// spending UTxO has minting data asset
// with correct MintingData datum
pub fn resolve_minting_data(spending_output: Output) -> MintingData {
  // check input has minting data asset
  expect
    value.quantity_of(
      spending_output.value,
      minting_data_asset_policy_id,
      minting_data_asset_name,
    ) == 1

  // resolve minting data datum
  expect InlineDatum(inline_minting_data) = spending_output.datum
  expect minting_data: MintingData = inline_minting_data

  minting_data
}
