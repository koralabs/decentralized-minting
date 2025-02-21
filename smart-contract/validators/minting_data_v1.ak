use aiken/bytearray
use aiken/list
use aiken/merkle_patricia_forestry as mpt
use aiken/transaction.{InlineDatum, ScriptContext, Transaction, WithdrawFrom}
use aiken/transaction/value.{PolicyId, Value}
use common/cip68.{prefix_100, prefix_222}
use common/hashes.{VerificationKeyHash}
use decentralized_minting/constants.{
  legacy_policy_id, mpt_legacy_handle_value, mpt_new_handle_value,
}
use decentralized_minting/minting_data.{MintingData, find_minting_data}
use decentralized_minting/settings.{Settings, find_settings}
use decentralized_minting/settings_v1.{SettingsV1}

type Handle {
  // with out asset name label
  Legacy(ByteArray)
  New(ByteArray)
}

type Proof {
  mpt_proof: mpt.Proof,
  handle: Handle,
  amount: Int,
}

// NOTE:
// Proofs must be in same order as minting assets
type MintingDataV1Redeemer {
  // when legacy or new handles are minted/burnt
  MintOrBurn(List<Proof>)
  // god mode - only available to kora lab admins
  GodMode
}

// NOTE:
// This is withdrawal script
// which is referred to as `minting_data_governor` in minting_data_proxy spending script
// This validator contains logic to check
// mpt_root_hash is correctly updated compared to actual minted assets (both legacy and new handles)
// `god_verification_key_hash` has the authority to spend minting_data_asset
// without actually minting assets
//
validator(god_verification_key_hash: VerificationKeyHash) {
  fn withdraw(redeemer: MintingDataV1Redeemer, ctx: ScriptContext) -> Bool {
    let ScriptContext(
      Transaction {
        inputs,
        reference_inputs,
        outputs,
        mint,
        extra_signatories,
        ..
      },
      purpose,
    ) = ctx
    expect WithdrawFrom(_) = purpose

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

    when redeemer is {
      MintOrBurn(proofs) -> {
        // expect proofs are not empty
        expect list.length(proofs) > 0

        // build merkle patricia trie from root hash
        let root = mpt.from_root(mpt_root_hash)

        // check proofs and 
        // calculate new root and expected mint value
        let
          new_root,
          expected_mint_value,
        <- all_proofs_are_valid(proofs, root, new_policy_id, value.zero())
        let new_mpt_root_hash = new_root |> mpt.root

        // check minting data output
        expect minting_data_output.address == minting_data_input.address
        expect minting_data_output.value == minting_data_input.value
        expect
          minting_data_output.datum == InlineDatum(
            MintingData { mpt_root_hash: new_mpt_root_hash },
          )
        expect minting_data_output.reference_script == None

        // check actual mint value
        expect value.from_minted_value(mint) == expected_mint_value

        True
      }
      GodMode -> {
        // check minting data output
        expect minting_data_output.address == minting_data_input.address
        expect minting_data_output.value == minting_data_input.value
        expect minting_data_output.reference_script == None

        // must be signed by god
        list.has(extra_signatories, god_verification_key_hash)
      }
    }
  }
}

fn all_proofs_are_valid(
  proofs: List<Proof>,
  root: mpt.MerklePatriciaForestry,
  new_policy_id: PolicyId,
  expected_mint_value: Value,
  continuation: fn(mpt.MerklePatriciaForestry, Value) -> result,
) -> result {
  when proofs is {
    [] -> continuation(root, expected_mint_value)
    [proof, ..rest_proofs] -> {
      let Proof { mpt_proof, handle, amount } = proof
      let (handle_name, mpt_handle_value) = get_handle_name_and_value(handle)

      all_proofs_are_valid(
        rest_proofs,
        update_root(root, handle_name, mpt_handle_value, amount, mpt_proof),
        new_policy_id,
        update_mint_value(expected_mint_value, new_policy_id, handle, amount),
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
