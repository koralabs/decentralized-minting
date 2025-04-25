use aiken/transaction.{ScriptContext, WithdrawFrom}
use common/hashes.{ScriptHash}
use validations/mint_v1/validation.{can_burn_handles, can_mint_handles}

type MintV1Redeemer {
  MintHandles
  BurnHandles
}

// NOTE:
// Withdrawal validator which holds all minting logic
// This is referred to as `mint_governor` in Settings datum
//
// ======= Parameters =======
// `minting_data_script_hash`: Script hash of current minting data script
// which is referred from SettingsV1
//
validator(minting_data_script_hash: ScriptHash) {
  fn withdraw(redeemer: MintV1Redeemer, ctx: ScriptContext) -> Bool {
    let ScriptContext { purpose, transaction } = ctx
    expect WithdrawFrom(_) = purpose

    when redeemer is {
      MintHandles -> can_mint_handles(transaction, minting_data_script_hash)
      BurnHandles -> can_burn_handles(transaction)
    }
  }
}
