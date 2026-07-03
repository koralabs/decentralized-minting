use aiken/interval
use aiken/primitive/bytearray
use cardano/address.{Address, Credential} as credential
use cardano/assets.{AssetName, PolicyId, Value} as value
use cardano/transaction.{
  Datum, InlineDatum, Input, NoDatum, Output, OutputReference, Transaction,
  placeholder,
}
use common/cip68.{prefix_222}
use common/hashes.{ScriptHash, VerificationKeyHash}
use decentralized_minting/discount.{DiscountConfig}
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
  let order: OrderDatum = OrderDatum {
    owner: Signature(owner_verification_key_hash),
    requested_handle,
    destination_address: credential.from_verification_key(
      owner_verification_key_hash,
    ),
    discount_claim: None,
    is_virtual: 0,
  }
  Input {
    output_reference: OutputReference {
      transaction_id: #"aaaa",
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

// $handle_policies registry reference input: the admin (legacy) 222 owner token carrying the
// policy-window `List<Pairs<policy,(first,last,sunset)>>` datum. Required by the fail-closed
// policy_window gate on every mint. `window = (0,0,0)` = dormant/allowed.
pub fn make_handle_policies_reference_input(
  admin_policy: PolicyId,
  listed_policy: PolicyId,
  window: (Int, Int, Int),
) -> Input {
  let asset_name = bytearray.concat(prefix_222, "handle_policies")
  let datum_value: List<Pairs<PolicyId, (Int, Int, Int)>> = [
    [Pair(listed_policy, window)],
  ]
  Input {
    output_reference: OutputReference {
      transaction_id: #"dded",
      output_index: 0,
    },
    output: Output {
      address: credential.from_verification_key(#"dded"),
      value: value.zero |> value.add(admin_policy, asset_name, 1),
      datum: InlineDatum(datum_value),
      reference_script: None,
    },
  }
}

pub fn make_settings_reference_input() -> Input {
  let settings_v1: SettingsV1 = SettingsV1 {
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
    discount_config: DiscountConfig {
      partner_nft_bps: 0,
      hal_bps: 0,
      og_bps: 0,
      legendary_bps: 0,
      ultra_rare_bps: 0,
      rare_bps: 0,
      free_virtual_count: 3,
      hal_policy_id: #"",
    },
    sub_handle_minter_fee: 2_000_000,
    sub_handle_treasury_fee: 0,
  }
  let settings: Settings = Settings {
    mint_governor,
    mint_version,
    data: settings_v1,
  }

  Input {
    output_reference: OutputReference {
      transaction_id: #"aaaa",
      output_index: 0,
    },
    output: Output {
      address: credential.from_verification_key(#"aaaa"),
      value: value.zero
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
    value: value.zero
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
      transaction_id: #"aaab",
      output_index: 0,
    },
    output: Output {
      address: credential.from_script(output_script_hash),
      value: value.zero
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
    value: value.zero
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
  withdrawals: Pairs<Credential, Int>,
  extra_signatories: List<VerificationKeyHash>,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs,
    reference_inputs,
    outputs,
    fee: 0,
    mint: mint_value,
    certificates: [],
    withdrawals,
    validity_range: interval.everything,
    extra_signatories,
    redeemers: [],
    id: #"",
  }
}
