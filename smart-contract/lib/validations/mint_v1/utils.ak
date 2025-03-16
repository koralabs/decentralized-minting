use aiken/bytearray
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/credential.{Address, ScriptCredential}
use aiken/transaction/value.{PolicyId, Value, ada_asset_name, ada_policy_id}
use common/cip68.{prefix_100, prefix_222}
use common/hashes.{ScriptHash}
use decentralized_minting/orders.{Destination, OrderDatum}

pub fn all_orders_are_satisfied(
  order_script_hash: ScriptHash,
  handle_policy_id: PolicyId,
  treasury_fee: Int,
  minter_fee: Int,
  pz_script_address: Address,
  inputs: List<Input>,
  outputs: List<Output>,
  total_treasury_fee: Int,
  total_minter_fee: Int,
  expected_mint_value: Value,
  continuation: fn(Int, Int, Value) -> result,
) -> result {
  when inputs is {
    [] ->
      continuation(total_treasury_fee, total_minter_fee, expected_mint_value)
    [input, ..rest_inputs] -> {
      let Output { address: Address { payment_credential, .. }, datum, .. } =
        input.output
      when payment_credential is {
        // check input is order or not
        ScriptCredential(sc) if sc == order_script_hash -> {
          // parse order datum
          expect InlineDatum(datum) = datum
          expect datum: OrderDatum = datum
          let OrderDatum { requested_handle, destination, .. } = datum

          // extract ref & user output
          expect [ref_output, user_output, ..rest_outputs] = outputs

          // make ref asset name and user asset name from requested_handle
          let ref_asset_name = bytearray.concat(prefix_100, requested_handle)
          let user_asset_name = bytearray.concat(prefix_222, requested_handle)

          // check ref output
          expect ref_output.address == pz_script_address
          let expected_ref_value =
            value.zero() |> value.add(handle_policy_id, ref_asset_name, 1)
          expect value.without_lovelace(ref_output.value) == expected_ref_value
          // ref asset's datum is set by minter
          expect ref_output.reference_script == None

          // check user output
          expect user_output.address == destination.address
          // user output value = order value - treasury_fee - minter_fee + minted handle (user)
          let expected_user_value =
            input.output.value
              |> value.add(
                  ada_policy_id,
                  ada_asset_name,
                  -(treasury_fee + minter_fee),
                )
              |> value.add(handle_policy_id, user_asset_name, 1)
          expect user_output.value == expected_user_value

          all_orders_are_satisfied(
            order_script_hash,
            handle_policy_id,
            treasury_fee,
            minter_fee,
            pz_script_address,
            rest_inputs,
            rest_outputs,
            total_treasury_fee + treasury_fee,
            total_minter_fee + minter_fee,
            // this also check only 1 user and 1 ref assets are minted
            expected_mint_value
              |> value.add(handle_policy_id, user_asset_name, 1)
              |> value.add(handle_policy_id, ref_asset_name, 1),
            continuation,
          )
        }
        _ ->
          all_orders_are_satisfied(
            order_script_hash,
            handle_policy_id,
            treasury_fee,
            minter_fee,
            pz_script_address,
            rest_inputs,
            outputs,
            total_treasury_fee,
            total_minter_fee,
            expected_mint_value,
            continuation,
          )
      }
    }
  }
}
