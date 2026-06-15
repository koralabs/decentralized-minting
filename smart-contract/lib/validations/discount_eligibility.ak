use aiken/primitive/bytearray
use cardano/address.{Address}
use cardano/assets.{PolicyId, quantity_of}
use cardano/transaction.{InlineDatum, Input, Output}
use common/cip68.{prefix_100, prefix_222}
use decentralized_minting/discount.{
  DiscountClaim, DiscountConfig, HalClaim, OgClaim, PartnerClaim, RarityClaim,
  apply_discount,
}
use decentralized_minting/discounts.{
  Cip68Datum, is_legendary, is_og, is_rare, is_ultra_rare,
  partner_policy_in_root, shares_credential,
}

// $pfp_policy_ids admin handle — its 100 reference token's datum is the partner-allowlist MPF
// root (a 32-byte ByteArray; see handles-personalization PolicyIndexRoot).
const pfp_policy_ids_name: ByteArray = "pfp_policy_ids"

// Everything the order loop needs to price a discount, bundled so it threads as one param.
pub type DiscountContext {
  config: DiscountConfig,
  reference_inputs: List<Input>,
  legacy_policy_id: PolicyId,
  new_policy_id: PolicyId,
  partner_root: ByteArray,
}

// Price a single order's handle after applying its (validated) discount claim. Verification
// fails the tx on a forged claim; an absent claim yields the full price.
pub fn effective_handle_price(
  handle_price: Int,
  claim: Option<DiscountClaim>,
  destination: Address,
  ctx: DiscountContext,
) -> Int {
  let bps =
    discount_bps_for_claim(
      claim,
      ctx.reference_inputs,
      destination,
      ctx.config,
      ctx.legacy_policy_id,
      ctx.new_policy_id,
      ctx.partner_root,
    )
  apply_discount(handle_price, bps)
}

// Read the partner-allowlist MPF root from the $pfp_policy_ids reference input (its 100 token
// under `admin_policy_id`). Absent -> empty root, so any partner claim then fails its proof.
pub fn read_partner_root(
  reference_inputs: List<Input>,
  admin_policy_id: PolicyId,
) -> ByteArray {
  let ref_name = bytearray.concat(prefix_100, pfp_policy_ids_name)
  when reference_inputs is {
    [] -> #""
    [ref_input, ..rest] -> {
      let Output { value, datum, .. } = ref_input.output
      if quantity_of(value, admin_policy_id, ref_name) >= 1 {
        when datum is {
          InlineDatum(d) -> {
            expect root: ByteArray = d
            root
          }
          _ -> #""
        }
      } else {
        read_partner_root(rest, admin_policy_id)
      }
    }
  }
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
        owner_holder(
          reference_inputs,
          handle_name,
          legacy_policy_id,
          new_policy_id,
        )
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
        owner_holder(
          reference_inputs,
          handle_name,
          legacy_policy_id,
          new_policy_id,
        )
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
      let holder =
        asset_holder(reference_inputs, config.hal_policy_id, asset_name)
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
      if
      quantity_of(value, legacy_policy_id, owner_name) >= 1 || quantity_of(
        value,
        new_policy_id,
        owner_name,
      ) >= 1{
      
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
      if
      quantity_of(value, legacy_policy_id, ref_name) >= 1 || quantity_of(
        value,
        new_policy_id,
        ref_name,
      ) >= 1{
      
        expect InlineDatum(d) = datum
        expect cip68: Cip68Datum = d
        cip68
      } else {
        og_reference_datum(rest, handle_name, legacy_policy_id, new_policy_id)
      }
    }
  }
}
