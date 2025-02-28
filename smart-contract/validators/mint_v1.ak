use aiken/transaction.{ScriptContext, WithdrawFrom}
use validations/mint_v1.{can_burn_handles, can_mint_handles}

type MintV1Redeemer {
  MintHandles
  BurnHandles
}

// NOTE:
// Withdrawal validator which holds all minting logic
// This is referred to as `mint_governor` in Settings datum
//
// Can update minting logic here 
// without changing policy id - which depends on mint_proxy validator
//
validator {
  fn withdraw(redeemer: MintV1Redeemer, ctx: ScriptContext) -> Bool {
    let ScriptContext { purpose, transaction } = ctx
    expect WithdrawFrom(_) = purpose

    when redeemer is {
      MintHandles -> can_mint_handles(transaction)
      BurnHandles -> can_burn_handles(transaction)
    }
  }
}
