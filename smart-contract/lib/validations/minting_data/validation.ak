use aiken/list
use aiken/merkle_patricia_forestry as mpt
use aiken/transaction.{
  InlineDatum, Input, OutputReference, Transaction, find_input,
}
use aiken/transaction/value.{PolicyId}
use common/hashes.{VerificationKeyHash}
use decentralized_minting/minting_data.{MintingData, resolve_minting_data}
use decentralized_minting/settings.{Settings, find_settings}
use decentralized_minting/settings_v1.{SettingsV1}
use validations/minting_data/types.{Proof}
use validations/minting_data/utils.{all_proofs_are_valid}

// Validation:
// Minting Data logic to check mpt_root_hash is correctly updated
//
// Checks
// - according to proofs (from redeemer), check mpt_root_hash is correctly updated
// Proof is for both legacy and new handles
// - check real minted assets are same as proofs' (legacy and new handle are in proofs)
//
pub fn can_mint_or_burn(
  transaction: Transaction,
  spending_output_reference: OutputReference,
  proofs: List<Proof>,
  legacy_policy_id: PolicyId,
) -> Bool {
  let Transaction { inputs, reference_inputs, outputs, mint, .. } = transaction

  // find settings 
  // find settings and parse
  let Settings { data: settings_data, .. } = find_settings(reference_inputs)
  expect settings_datum: SettingsV1 = settings_data
  let SettingsV1 { policy_id: new_policy_id, .. } = settings_datum

  // find minting data input which is own input
  expect Some(spending_input) = find_input(inputs, spending_output_reference)
  let Input { output: minting_data_input, .. } = spending_input
  let MintingData { mpt_root_hash } = resolve_minting_data(minting_data_input)

  // parse outputs
  expect [minting_data_output, ..] = outputs

  // expect proofs are not empty
  expect list.length(proofs) > 0

  // build merkle patricia trie from root hash
  let root = mpt.from_root(mpt_root_hash)

  // check proofs and 
  // calculate new root and expected mint value
  let
    new_root,
    expected_mint_value,
  <-
    all_proofs_are_valid(
      proofs,
      root,
      legacy_policy_id,
      new_policy_id,
      value.zero(),
    )
  let new_mpt_root_hash = new_root |> mpt.root

  // check minting data output
  expect minting_data_output.address == minting_data_input.address
  expect
    value.without_lovelace(minting_data_output.value) == value.without_lovelace(
      minting_data_input.value,
    )
  expect
    value.lovelace_of(minting_data_output.value) >= value.lovelace_of(
      minting_data_input.value,
    )
  expect
    minting_data_output.datum == InlineDatum(
      MintingData { mpt_root_hash: new_mpt_root_hash },
    )
  expect minting_data_output.reference_script == None

  // check actual mint value
  expect value.from_minted_value(mint) == expected_mint_value

  True
}

pub fn can_god_mode(
  transaction: Transaction,
  god_verification_key_hash: VerificationKeyHash,
) -> Bool {
  let Transaction { extra_signatories, .. } = transaction

  // must be signed by god
  expect list.has(extra_signatories, god_verification_key_hash)

  True
}
