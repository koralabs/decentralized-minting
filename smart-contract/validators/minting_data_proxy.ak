use aiken/transaction.{ScriptContext, Spend, Transaction}
use common/utils.{is_withdrawal_script_executed}
use decentralized_minting/minting_data.{MintingData}
use decentralized_minting/settings.{Settings, find_settings}
use decentralized_minting/settings_v1.{SettingsV1}

// NOTE:
// This is spending validator
// It is referred as `minting_data_governor` in SettingsV1
// which controls the MPT root hash (of all handles)
// To spend minting data asset, you have to mint correctly
// (New root hash must match minted NFTs - both legacy and new handles)

validator {
  pub fn spend(_minting_data: MintingData, _r: Data, ctx: ScriptContext) {
    let ScriptContext(
      Transaction { reference_inputs, withdrawals, .. },
      purpose,
    ) = ctx
    expect Spend(_) = purpose

    // find settings and parse
    let Settings { data, .. } = find_settings(reference_inputs)
    expect settings_datum: SettingsV1 = data
    let SettingsV1 { minting_data_governor, .. } = settings_datum

    expect is_withdrawal_script_executed(withdrawals, minting_data_governor)
    True
  }
}
