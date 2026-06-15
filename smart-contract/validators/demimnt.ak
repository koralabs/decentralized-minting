use cardano/address.{Credential}
use cardano/transaction.{Transaction}
use common/hashes.{ScriptHash}
use validations/mint_v1/validation.{can_burn_handles, can_mint_handles}

pub type MintV1Redeemer {
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
validator demimnt(minting_data_script_hash: ScriptHash) {
  withdraw(redeemer: MintV1Redeemer, _account: Credential, tx: Transaction) {
    when redeemer is {
      MintHandles -> can_mint_handles(tx, minting_data_script_hash)
      BurnHandles -> can_burn_handles(tx, minting_data_script_hash)
    }
  }

  else(_) {
    fail
  }
}
