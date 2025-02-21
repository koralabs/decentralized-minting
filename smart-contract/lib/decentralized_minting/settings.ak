use aiken/list
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/value
use common/hashes.{ScriptHash}

const settings_asset_policy_id =
  #"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"

// demi@handle_settings
// hold the settings for the decentralized minting contract
// const settings_asset_name = #"000de14064656d694068616e646c655f73657474696e6773"
const settings_asset_name = #"000de140676f6c646479646576"

pub type Settings {
  mint_governor: ScriptHash,
  mint_version: Int,
  // setting v1 data
  data: Data,
}

pub fn find_settings(reference_inputs: List<Input>) -> Settings {
  expect Some(settings_input) =
    list.find(
      reference_inputs,
      fn(i) {
        value.quantity_of(
          i.output.value,
          settings_asset_policy_id,
          settings_asset_name,
        ) == 1
      },
    )
  expect InlineDatum(settings_datum) = settings_input.output.datum
  expect settings_datum: Settings = settings_datum
  settings_datum
}
