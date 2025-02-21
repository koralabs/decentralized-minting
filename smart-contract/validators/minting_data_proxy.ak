use aiken/transaction.{ScriptContext, Spend, Transaction}
use common/hashes.{ScriptHash}
use common/utils.{is_withdrawal_script_executed}
use decentralized_minting/minting_data.{MintingData}

// NOTE:
// This is spending validator
// It is referred to as `minting_data_script_hash` in SettingsV1
// This validators locks minting_data_asset
// which holds the MPT root hash (of all handles) in its datum
// To mint new decentralized handles, you must spend minting_data_asset from here
//
validator(minting_data_governor: ScriptHash) {
  pub fn spend(_minting_data: MintingData, _r: Data, ctx: ScriptContext) {
    let ScriptContext(Transaction { withdrawals, .. }, purpose) = ctx
    expect Spend(_) = purpose

    // check if minting_data_governor is executed
    expect is_withdrawal_script_executed(withdrawals, minting_data_governor)
    True
  }
}
