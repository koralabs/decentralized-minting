use aiken/bytearray
use aiken/cbor
use aiken/dict.{Dict}
use aiken/hash.{Blake2b_224, Hash}
use aiken/list
use aiken/merkle_patricia_forestry as mpf
use aiken/transaction.{
  InlineDatum, Input, Output, ScriptContext, Transaction, WithdrawFrom,
}
use aiken/transaction/credential.{Address, Script, ScriptCredential}
use aiken/transaction/value.{AssetName, PolicyId, ada_asset_name, ada_policy_id}
use decentralized_minting/types.{OrderDatum, Settings, SettingsV1}
use decentralized_minting/utils.{find_settings_datum}

validator(settings_policy: PolicyId, order_script: Hash<Blake2b_224, Script>) {
  fn withdraw(proofs: List<mpf.Proof>, ctx: ScriptContext) -> Bool {
    let ScriptContext { purpose, transaction } = ctx
    when purpose is {
      WithdrawFrom(_) -> {
        let (settings_input, Settings { data, .. }) =
          find_settings_datum(transaction.inputs, settings_policy)
        expect settings_datum: SettingsV1 = data
        expect [settings, treasury, minter, ..outputs] = transaction.outputs
        expect settings.address == settings_input.address
        expect settings.value == settings_input.value
        expect treasury.address == settings_datum.treasury_address
        expect treasury.datum == InlineDatum(Void)
        let root = mpf.from_root(settings_datum.all_handles)
        let actual_minted_handles =
          transaction.mint
            |> value.from_minted_value()
            |> value.tokens(settings_datum.policy_id)
        let
          treasury_fee,
          minter_fee,
          expected_minted_handles,
        <-
          all_orders_satisfied(
            order_script,
            settings_datum.policy_id,
            settings_datum,
            proofs,
            transaction.inputs,
            outputs,
            root,
            0,
            0,
            dict.new(),
          )
        expect
          list.any(
            settings_datum.allowed_minters,
            fn(m) { list.has(transaction.extra_signatories, m) },
          )
        expect value.lovelace_of(treasury.value) >= treasury_fee
        expect value.lovelace_of(minter.value) >= minter_fee
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
  settings: SettingsV1,
  proofs: List<mpf.Proof>,
  inputs: List<Input>,
  outputs: List<Output>,
  root: mpf.MerklePatriciaForestry,
  treasury_fee: Int,
  minter_fee: Int,
  minted_handles: Dict<AssetName, Int>,
  continuation: fn(Int, Int, Dict<AssetName, Int>) -> Bool,
) -> Bool {
  when inputs is {
    [] -> continuation(treasury_fee, minter_fee, minted_handles)
    [i, ..rest] -> {
      let Output { address: Address { payment_credential, .. }, datum, .. } =
        i.output
      when payment_credential is {
        ScriptCredential(sc) if sc == order_script -> {
          expect InlineDatum(datum) = datum
          expect datum: OrderDatum = datum
          let OrderDatum { requested_handle, destination, .. } = datum
          expect [proof, ..rest_proofs] = proofs
          expect [output, ..rest_outputs] = outputs
          // This fails if the handle already exists
          let new_root = mpf.insert(root, requested_handle, "NEW", proof)
          expect output.address == destination.address
          expect output.datum == destination.datum
          let remainder =
            i.output.value
              |> value.add(handle_policy, requested_handle, 1)
              |> value.add(
                  ada_policy_id,
                  ada_asset_name,
                  -(settings.treasury_fee + settings.minter_fee),
                )
          trace bytearray.to_hex(cbor.serialise(remainder))
          trace bytearray.to_hex(cbor.serialise(output.value))
          expect output.value == remainder
          all_orders_satisfied(
            order_script,
            handle_policy,
            settings,
            rest_proofs,
            rest,
            rest_outputs,
            new_root,
            treasury_fee + settings.treasury_fee,
            minter_fee + settings.minter_fee,
            dict.insert(minted_handles, requested_handle, 1),
            // this also check only 1 requested_handle is minted
            continuation,
          )
        }
        _ ->
          all_orders_satisfied(
            order_script,
            handle_policy,
            settings,
            proofs,
            rest,
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
