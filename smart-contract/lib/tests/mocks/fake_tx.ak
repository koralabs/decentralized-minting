use aiken/dict
use aiken/interval
use aiken/transaction.{
  Datum, InlineDatum, Input, NoDatum, Output, OutputReference, Transaction,
  TransactionId,
}
use aiken/transaction/credential.{Address, StakeCredential}
use aiken/transaction/value.{AssetName, PolicyId, Value}
use common/hashes.{ScriptHash, VerificationKeyHash}
use decentralized_minting/handle_price.{HandlePriceInfo}
use decentralized_minting/minting_data.{MintingData}
use decentralized_minting/orders.{OrderDatum}
use decentralized_minting/settings.{Settings}
use decentralized_minting/settings_v1.{SettingsV1}
use sundae/multisig.{Signature}
use tests/mocks/fake_constants.{
  allowed_minter_0, allowed_minter_1, current_handle_price_data,
  min_order_lovelace, mint_governor, mint_version, minting_data_asset_name,
  minting_data_asset_policy_id, minting_data_script_hash, new_policy_id,
  order_script_hash, prev_handle_price_data, pz_script_address,
  settings_asset_name, settings_asset_policy_id, treasury_address,
  treasury_fee_percentage, valid_handle_price_asset_0,
  valid_handle_price_asset_1,
}

pub fn make_output(address: Address, v: Value) -> Output {
  Output { address, value: v, datum: NoDatum, reference_script: None }
}

pub fn make_output_with_datum(
  address: Address,
  v: Value,
  datum: Datum,
) -> Output {
  Output { address, value: v, datum, reference_script: None }
}

pub fn make_order_input(
  owner_verification_key_hash: VerificationKeyHash,
  requested_handle: ByteArray,
) -> Input {
  let order: OrderDatum =
    OrderDatum {
      owner: Signature(owner_verification_key_hash),
      requested_handle,
      destination_address: credential.from_verification_key(
        owner_verification_key_hash,
      ),
    }
  Input {
    output_reference: OutputReference {
      transaction_id: TransactionId { hash: #"aaaa" },
      output_index: 0,
    },
    output: Output {
      address: credential.from_script(order_script_hash),
      value: value.from_lovelace(min_order_lovelace),
      datum: InlineDatum(order),
      reference_script: None,
    },
  }
}

pub fn make_test_address() -> Address {
  credential.from_verification_key(#"00")
    |> credential.with_delegation_key(#"00")
}

pub fn make_settings_reference_input() -> Input {
  let settings_v1: SettingsV1 =
    SettingsV1 {
      policy_id: new_policy_id,
      allowed_minters: [allowed_minter_0, allowed_minter_1],
      valid_handle_price_assets: [
        valid_handle_price_asset_0(),
        valid_handle_price_asset_1(),
      ],
      treasury_address: treasury_address(),
      treasury_fee_percentage,
      pz_script_address: pz_script_address(),
      order_script_hash,
      minting_data_script_hash,
    }
  let settings: Settings =
    Settings { mint_governor, mint_version, data: settings_v1 }

  Input {
    output_reference: OutputReference {
      transaction_id: TransactionId { hash: #"aaaa" },
      output_index: 0,
    },
    output: Output {
      address: credential.from_verification_key(#"aaaa"),
      value: value.zero()
        |> value.add(settings_asset_policy_id, settings_asset_name, 1),
      datum: InlineDatum(settings),
      reference_script: None,
    },
  }
}

pub fn make_minting_data_output(
  mpt_root_hash: ByteArray,
  output_script_hash: ScriptHash,
) -> Output {
  let minting_data: MintingData = MintingData { mpt_root_hash }
  Output {
    address: credential.from_script(output_script_hash),
    value: value.zero()
      |> value.add(minting_data_asset_policy_id, minting_data_asset_name, 1),
    datum: InlineDatum(minting_data),
    reference_script: None,
  }
}

pub fn make_minting_data_input(
  mpt_root_hash: ByteArray,
  output_script_hash: ScriptHash,
) -> Input {
  let minting_data: MintingData = MintingData { mpt_root_hash }
  Input {
    output_reference: OutputReference {
      transaction_id: TransactionId { hash: #"aaab" },
      output_index: 0,
    },
    output: Output {
      address: credential.from_script(output_script_hash),
      value: value.zero()
        |> value.add(minting_data_asset_policy_id, minting_data_asset_name, 1),
      datum: InlineDatum(minting_data),
      reference_script: None,
    },
  }
}

pub fn make_handle_price_info() -> HandlePriceInfo {
  HandlePriceInfo {
    current_data: current_handle_price_data(),
    prev_data: prev_handle_price_data(),
    updated_at: 0,
  }
}

pub fn make_handle_price_info_output(
  valid_handle_price_asset: (PolicyId, AssetName),
) -> Output {
  let (policy_id, asset_name) = valid_handle_price_asset

  Output {
    address: credential.from_verification_key(#"abab"),
    value: value.zero()
      |> value.add(policy_id, asset_name, 1),
    datum: InlineDatum(make_handle_price_info()),
    reference_script: None,
  }
}

pub fn make_fee_output(fee_address: Address, fee: Int) {
  Output {
    address: fee_address,
    value: value.from_lovelace(fee),
    datum: InlineDatum(Void),
    reference_script: None,
  }
}

pub fn make_transaction(
  inputs: List<Input>,
  reference_inputs: List<Input>,
  outputs: List<Output>,
  mint_value: Value,
  withdrawals: Pairs<StakeCredential, Int>,
  extra_signatories: List<VerificationKeyHash>,
) -> Transaction {
  Transaction {
    inputs,
    reference_inputs,
    outputs,
    fee: value.zero(),
    mint: mint_value |> value.to_minted_value,
    certificates: [],
    withdrawals,
    validity_range: interval.everything(),
    extra_signatories,
    redeemers: [],
    datums: dict.new(),
    id: TransactionId { hash: #"" },
  }
}
