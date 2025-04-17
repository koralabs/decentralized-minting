use aiken/transaction.{Mint, ScriptContext, Transaction}
use common/utils.{is_withdrawal_script_executed}
use decentralized_minting/settings.{Settings, find_settings}

// NOTE:
// This is minting policy for new decentralized handle
// Whose id (policy id) should not change without strong reason
// All mint logic is in mint_governor
//
// ========================= When policy id can change? =========================
// - version (in parameter) is changed
// - decentralized_minting/settings library is changed
//
// Why we have version as parameter?
// There can be some reason to update policy id
// without changing mint logic
//
// WARN >> version must be greater than or equal to 0
// and settings' mint_version must be same as parameter to mint handles
//
validator(version: Int) {
  pub fn mint(_r: Data, ctx: ScriptContext) {
    let ScriptContext { transaction, purpose } = ctx
    expect Mint(_) = purpose

    let Transaction { withdrawals, reference_inputs, .. } = transaction

    // find settings asset and parse it
    let Settings { mint_governor, mint_version, .. } =
      find_settings(reference_inputs)

    // check version match
    expect version >= 0 && version == mint_version

    // check mint_governor is executed
    expect is_withdrawal_script_executed(withdrawals, mint_governor)

    True
  }
}
