use aiken/dict.{Dict}
use aiken/hash.{Blake2b_224, Hash}
use aiken/list
use aiken/merkle_patricia_forestry as mpt
use aiken/transaction.{
  InlineDatum, Input, Output, ScriptContext, Transaction, WithdrawFrom,
}
use aiken/transaction/credential.{Address, Script, ScriptCredential}
use aiken/transaction/value.{AssetName, PolicyId, ada_asset_name, ada_policy_id}
use decentralized_minting/minting/types.{AllHandles} as minting_types
use decentralized_minting/minting/utils.{find_handles_root} as minting_utils
use decentralized_minting/orders/types.{Destination, OrderDatum} as order_types
use decentralized_minting/settings/types.{Settings,
  SettingsV1} as settings_types
use decentralized_minting/settings/utils.{find_settings} as settings_utils

validator(order_script: Hash<Blake2b_224, Script>) {
  fn withdraw(proofs: List<mpt.Proof>, ctx: ScriptContext) -> Bool {
    let ScriptContext { purpose, transaction } = ctx
    let Transaction { inputs, outputs, extra_signatories, mint, .. } =
      transaction
    when purpose is {
      WithdrawFrom(_) -> {
        // find settings and parse
        let (settings_input, Settings { data, .. }) = find_settings(inputs)
        expect settings_datum: SettingsV1 = data
        let SettingsV1 {
          allowed_minters,
          treasury_address,
          treasury_fee,
          minter_fee,
          policy_id,
        } = settings_datum

        // find mpt root hash
        let (handles_root_input, AllHandles { mpt_root_hash }) =
          find_handles_root(inputs)

        // parse outputs
        expect [
          settings_output,
          handles_root_output,
          treasury_output,
          minter_output,
          ..rest_outputs
        ] = outputs

        // check settings output (no ref script attached)
        expect settings_output.address == settings_input.address
        expect settings_output.value == settings_input.value
        expect settings_output.reference_script == None

        // check handles root output (no ref script attached)
        expect handles_root_output.address == handles_root_input.address
        expect handles_root_output.value == handles_root_input.value
        expect handles_root_output.reference_script == None

        // check treasury output
        expect treasury_output.address == treasury_address
        expect treasury_output.datum == InlineDatum(Void)
        expect treasury_output.reference_script == None

        // check allowed_minters sign tx
        expect
          list.any(allowed_minters, fn(m) { list.has(extra_signatories, m) })

        // build merkle tree from root
        let root = mpt.from_root(mpt_root_hash)

        // check merkle tree with proofs
        // NOTE: proofs and orders are must be same order
        let
          new_root,
          total_treasury_fee,
          total_minter_fee,
          expected_minted_handles,
        <-
          all_orders_satisfied(
            order_script,
            policy_id,
            treasury_fee,
            minter_fee,
            proofs,
            inputs,
            rest_outputs,
            root,
            0,
            0,
            dict.new(),
          )

        // check handles root output's datum
        expect
          handles_root_output.datum == InlineDatum(
            AllHandles { mpt_root_hash: new_root |> mpt.root() },
          )

        // check treasury and minter fee
        expect value.lovelace_of(treasury_output.value) >= total_treasury_fee
        expect value.lovelace_of(minter_output.value) >= total_minter_fee

        // check minted handles
        let actual_minted_handles =
          mint
            |> value.from_minted_value()
            |> value.tokens(policy_id)
        expect actual_minted_handles == expected_minted_handles
        True
      }
      _ -> False
    }
  }
}

fn all_orders_satisfied(
  order_script: Hash<Blake2b_224, Script>,
  handle_policy: PolicyId,
  treasury_fee: Int,
  minter_fee: Int,
  proofs: List<mpt.Proof>,
  inputs: List<Input>,
  outputs: List<Output>,
  root: mpt.MerklePatriciaForestry,
  total_treasury_fee: Int,
  total_minter_fee: Int,
  minted_handles: Dict<AssetName, Int>,
  continuation: fn(mpt.MerklePatriciaForestry, Int, Int, Dict<AssetName, Int>) ->
    Bool,
) -> Bool {
  when inputs is {
    [] ->
      continuation(root, total_treasury_fee, total_minter_fee, minted_handles)
    [input, ..rest_inputs] -> {
      let Output { address: Address { payment_credential, .. }, datum, .. } =
        input.output
      when payment_credential is {
        ScriptCredential(sc) if sc == order_script -> {
          // parse order datum
          expect InlineDatum(datum) = datum
          expect datum: OrderDatum = datum
          let OrderDatum { requested_handle, destination, .. } = datum

          expect [proof, ..rest_proofs] = proofs
          expect [output, ..rest_outputs] = outputs

          // This fails if the handle already exists
          let new_root = mpt.insert(root, requested_handle, "NEW", proof)

          // check output address and datum and value
          expect output.address == destination.address
          expect output.datum == destination.datum
          let remainder =
            input.output.value
              |> value.add(handle_policy, requested_handle, 1)
              |> value.add(
                  ada_policy_id,
                  ada_asset_name,
                  -(treasury_fee + minter_fee),
                )
          expect output.value == remainder

          all_orders_satisfied(
            order_script,
            handle_policy,
            treasury_fee,
            minter_fee,
            rest_proofs,
            rest_inputs,
            rest_outputs,
            new_root,
            total_treasury_fee + treasury_fee,
            total_minter_fee + minter_fee,
            dict.insert(minted_handles, requested_handle, 1),
            // this also check only 1 requested_handle is minted
            continuation,
          )
        }
        _ ->
          all_orders_satisfied(
            order_script,
            handle_policy,
            treasury_fee,
            minter_fee,
            proofs,
            rest_inputs,
            outputs,
            root,
            treasury_fee,
            minter_fee,
            minted_handles,
            continuation,
          )
      }
    }
  }
}
