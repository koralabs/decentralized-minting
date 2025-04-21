use aiken/transaction.{Output, Transaction}
use aiken/transaction/credential.{Address, ScriptCredential}
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
  minting_data_index: Int,
  minting_data_script_hash: ScriptHash,
) -> Bool {
  trace @"Start Mint V1"
  let Transaction { inputs, .. } = transaction

  // check mpt root hash is correctly updated
  // find minting_data and check that is spent from minting_data script
  let (minting_data_input, _) = find_minting_data(inputs, minting_data_index)
  expect
    minting_data_input.address.payment_credential == ScriptCredential(
      minting_data_script_hash,
    )
  True
}

pub fn can_burn_handles(_transaction: Transaction) -> Bool {
  trace @"Burn is disabled now"
  False
}
