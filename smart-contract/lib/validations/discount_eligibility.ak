use aiken/bytearray
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{PolicyId, quantity_of}
use common/cip68.{prefix_100, prefix_222}
use decentralized_minting/discount.{
  DiscountClaim, DiscountConfig, HalClaim, OgClaim, PartnerClaim, RarityClaim,
}
use decentralized_minting/discounts.{
  Cip68Datum, is_legendary, is_og, is_rare, is_ultra_rare, partner_policy_in_root,
  shares_credential,
}

// WS5 — verify an order's discount claim and return the basis-points discount it earns
// (0 when there's no claim). FAILS on a forged claim — the qualifying asset must be referenced
// AND share a credential with the order's destination — so a discounted order can't be faked.
pub fn discount_bps_for_claim(
  claim: Option<DiscountClaim>,
  reference_inputs: List<Input>,
  destination: Address,
  config: DiscountConfig,
  legacy_policy_id: PolicyId,
  new_policy_id: PolicyId,
  partner_root: ByteArray,
) -> Int {
  when claim is {
    None -> 0
    Some(RarityClaim { handle_name }) -> {
      let holder =
        owner_holder(reference_inputs, handle_name, legacy_policy_id, new_policy_id)
      expect shares_credential(holder, destination)
      if is_legendary(handle_name) {
        config.legendary_bps
      } else if is_ultra_rare(handle_name) {
        config.ultra_rare_bps
      } else if is_rare(handle_name) {
        config.rare_bps
      } else {
        fail @"RARITY_CLAIM_NOT_RARE"
      }
    }
    Some(OgClaim { handle_name }) -> {
      let holder =
        owner_holder(reference_inputs, handle_name, legacy_policy_id, new_policy_id)
      expect shares_credential(holder, destination)
      let ref_datum =
        og_reference_datum(
          reference_inputs,
          handle_name,
          legacy_policy_id,
          new_policy_id,
        )
      expect is_og(ref_datum)
      config.og_bps
    }
    Some(PartnerClaim { policy_id, asset_name, value, proof }) -> {
      let holder = asset_holder(reference_inputs, policy_id, asset_name)
      expect shares_credential(holder, destination)
      expect partner_policy_in_root(partner_root, policy_id, value, proof)
      config.partner_nft_bps
    }
    Some(HalClaim { asset_name }) -> {
      let holder = asset_holder(reference_inputs, config.hal_policy_id, asset_name)
      expect shares_credential(holder, destination)
      config.hal_bps
    }
  }
}

// Address holding a given asset among the reference inputs (fails if absent).
fn asset_holder(
  reference_inputs: List<Input>,
  policy_id: PolicyId,
  asset_name: ByteArray,
) -> Address {
  when reference_inputs is {
    [] -> fail @"QUALIFYING_ASSET_NOT_REFERENCED"
    [ref_input, ..rest] -> {
      let Output { address, value, .. } = ref_input.output
      if quantity_of(value, policy_id, asset_name) >= 1 {
        address
      } else {
        asset_holder(rest, policy_id, asset_name)
      }
    }
  }
}

// Address holding the handle's 222 owner token (under the legacy or new policy).
fn owner_holder(
  reference_inputs: List<Input>,
  handle_name: ByteArray,
  legacy_policy_id: PolicyId,
  new_policy_id: PolicyId,
) -> Address {
  let owner_name = bytearray.concat(prefix_222, handle_name)
  when reference_inputs is {
    [] -> fail @"OWNER_222_NOT_REFERENCED"
    [ref_input, ..rest] -> {
      let Output { address, value, .. } = ref_input.output
      if quantity_of(value, legacy_policy_id, owner_name) >= 1 || quantity_of(
        value,
        new_policy_id,
        owner_name,
      ) >= 1 {
        address
      } else {
        owner_holder(rest, handle_name, legacy_policy_id, new_policy_id)
      }
    }
  }
}

// CIP-68 datum of the handle's 100 reference token (under the legacy or new policy).
fn og_reference_datum(
  reference_inputs: List<Input>,
  handle_name: ByteArray,
  legacy_policy_id: PolicyId,
  new_policy_id: PolicyId,
) -> Cip68Datum {
  let ref_name = bytearray.concat(prefix_100, handle_name)
  when reference_inputs is {
    [] -> fail @"OG_REFERENCE_TOKEN_NOT_REFERENCED"
    [ref_input, ..rest] -> {
      let Output { value, datum, .. } = ref_input.output
      if quantity_of(value, legacy_policy_id, ref_name) >= 1 || quantity_of(
        value,
        new_policy_id,
        ref_name,
      ) >= 1 {
        expect InlineDatum(d) = datum
        expect cip68: Cip68Datum = d
        cip68
      } else {
        og_reference_datum(rest, handle_name, legacy_policy_id, new_policy_id)
      }
    }
  }
}
