use aiken/bytearray
use aiken/list
use aiken/merkle_patricia_forestry as mpt
use aiken/transaction.{InlineDatum, Transaction}
use aiken/transaction/value.{PolicyId, Value}
use common/cip68.{prefix_100, prefix_222}
use common/hashes.{VerificationKeyHash}
use decentralized_minting/constants.{
  mpt_legacy_handle_value, mpt_new_handle_value,
}
use decentralized_minting/minting_data.{MintingData, find_minting_data}
use decentralized_minting/settings.{Settings, find_settings}
use decentralized_minting/settings_v1.{SettingsV1}

const max_handle_length = 15

// with out asset name label
pub type Handle {
  Legacy(ByteArray)
  New(ByteArray)
}

pub type Proof {
  mpt_proof: mpt.Proof,
  handle: Handle,
  amount: Int,
}

pub fn can_mint_or_burn(
  transaction: Transaction,
  proofs: List<Proof>,
  legacy_policy_id: PolicyId,
) -> Bool {
  let Transaction { inputs, reference_inputs, outputs, mint, .. } = transaction

  // find settings 
  // find settings and parse
  let Settings { data: settings_data, .. } = find_settings(reference_inputs)
  expect settings_datum: SettingsV1 = settings_data
  let SettingsV1 { policy_id: new_policy_id, .. } = settings_datum

  // find minting data input
  let (minting_data_input, MintingData { mpt_root_hash }) =
    find_minting_data(inputs)

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

// This function also check handle_name is valid or not
fn all_proofs_are_valid(
  proofs: List<Proof>,
  root: mpt.MerklePatriciaForestry,
  legacy_policy_id: PolicyId,
  new_policy_id: PolicyId,
  expected_mint_value: Value,
  continuation: fn(mpt.MerklePatriciaForestry, Value) -> result,
) -> result {
  when proofs is {
    [] -> continuation(root, expected_mint_value)
    [proof, ..rest_proofs] -> {
      let Proof { mpt_proof, handle, amount } = proof
      let (handle_name, mpt_handle_value) = get_handle_name_and_value(handle)

      // disable sub handle minting
      expect is_sub_handle(handle_name) == False

      // check handle name length
      expect bytearray.length(handle_name) <= max_handle_length

      all_proofs_are_valid(
        rest_proofs,
        update_root(root, handle_name, mpt_handle_value, amount, mpt_proof),
        legacy_policy_id,
        new_policy_id,
        update_mint_value(
          expected_mint_value,
          legacy_policy_id,
          new_policy_id,
          handle,
          amount,
        ),
        continuation,
      )
    }
  }
}

fn update_root(
  root: mpt.MerklePatriciaForestry,
  handle_name: ByteArray,
  mpt_handle_value: ByteArray,
  amount: Int,
  mpt_proof: mpt.Proof,
) -> mpt.MerklePatriciaForestry {
  when amount is {
    1 ->
      // mint
      mpt.insert(root, handle_name, mpt_handle_value, mpt_proof)
    -1 ->
      // burn
      mpt.delete(root, handle_name, mpt_handle_value, mpt_proof)
    _ -> fail @"proof amount can only be 1 or -1"
  }
}

fn update_mint_value(
  mint_value: Value,
  legacy_policy_id: PolicyId,
  new_policy_id: PolicyId,
  handle: Handle,
  amount: Int,
) -> Value {
  when handle is {
    Legacy(handle_name) ->
      mint_value
        |> value.add(
            legacy_policy_id,
            bytearray.concat(prefix_100, handle_name),
            amount,
          )
        |> value.add(
            legacy_policy_id,
            bytearray.concat(prefix_222, handle_name),
            amount,
          )
    New(handle_name) ->
      mint_value
        |> value.add(
            new_policy_id,
            bytearray.concat(prefix_100, handle_name),
            amount,
          )
        |> value.add(
            new_policy_id,
            bytearray.concat(prefix_222, handle_name),
            amount,
          )
  }
}

fn get_handle_name_and_value(handle: Handle) -> (ByteArray, ByteArray) {
  when handle is {
    Legacy(handle_name) -> (handle_name, mpt_legacy_handle_value)
    New(handle_name) -> (handle_name, mpt_new_handle_value)
  }
}

fn is_sub_handle(handle_name: ByteArray) -> Bool {
  handle_name
    |> bytearray.foldl(False, fn(char, result) { result || char == 0x40 })
}
