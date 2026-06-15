use cardano/address.{Address, Script}
use cardano/transaction.{Output, Transaction}
use common/hashes.{ScriptHash}
use decentralized_minting/minting_data.{find_minting_data}

// Validation:
// Main validation logic for new handles' minting
//
// Checks
// - minting_data asset is spent from minting_data_script from parameter
//
pub fn can_mint_handles(
  transaction: Transaction,
  minting_data_script_hash: ScriptHash,
) -> Bool {
  trace @"Start Mint V1"
  let Transaction { inputs, .. } = transaction

  // check mpt root hash is correctly updated
  // find minting_data and check that is spent from minting_data script
  let (minting_data_input, _) = find_minting_data(inputs)
  expect
    minting_data_input.address.payment_credential == Script(
      minting_data_script_hash,
    )
  True
}

// Mirror of can_mint_handles for burning: the governor only ensures the burn is accompanied by a
// minting_data spend (so the MPT root is kept in sync — the BurnNewHandles redeemer there does the
// MPT delete + the -1 mint check + the free-name reopen). Owner consent is enforced where the
// tokens live (the holder must provide the 222/000 as burned inputs, and the pz contract releases
// its held 100/000), not here.
pub fn can_burn_handles(
  transaction: Transaction,
  minting_data_script_hash: ScriptHash,
) -> Bool {
  trace @"Start Burn V1"
  let Transaction { inputs, .. } = transaction
  let (minting_data_input, _) = find_minting_data(inputs)
  expect
    minting_data_input.address.payment_credential == Script(
      minting_data_script_hash,
    )
  True
}
