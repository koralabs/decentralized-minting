use aiken/bytearray
use aiken/list
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{PolicyId}

// WS5 — minting-discount eligibility primitives.
//
// Eligibility is proven by *referencing* a qualifying asset (a rare/OG handle, or a partner
// NFT) as a reference input — possession without spending — and checking that the referenced
// asset's holding address shares a credential with the minter's destination. These are the
// pure checks; wiring them into the mint validator (locate the ref input, read the OG list /
// partner-policy allowlist from an admin datum, and apply the discount to the order price) is
// the integration step (see plan WS5: the OG/partner allowlist's on-chain home — an admin
// datum read as a ref input, mirroring `$pfp_policy_ids` — is the open sub-item).

// Possession proof: the qualifying asset's holder and the minter's destination share a
// credential. Payment-credential match OR stake-credential match (both present and equal).
// `None`/`None` stake never counts as a match.
pub fn shares_credential(holder: Address, destination: Address) -> Bool {
  or {
    holder.payment_credential == destination.payment_credential,
    when (holder.stake_credential, destination.stake_credential) is {
      (Some(holder_stake), Some(destination_stake)) ->
        holder_stake == destination_stake
      _ -> False
    },
  }
}

// Rarity, by referenced handle name length (legacy semantics): UltraRare = 2 chars, Rare = 3.
pub fn is_ultra_rare(handle_name: ByteArray) -> Bool {
  bytearray.length(handle_name) == 2
}

pub fn is_rare(handle_name: ByteArray) -> Bool {
  bytearray.length(handle_name) == 3
}

// Either rarity tier qualifies for a rarity discount (the tier selects the discount amount).
pub fn qualifies_for_rarity_discount(handle_name: ByteArray) -> Bool {
  is_ultra_rare(handle_name) || is_rare(handle_name)
}

// Partner-NFT eligibility: the referenced asset's policy is in the allowlisted partner set
// (the allowlist comes from the admin datum at wiring time).
pub fn policy_in_allowlist(
  policy_id: PolicyId,
  allowlist: List<PolicyId>,
) -> Bool {
  list.has(allowlist, policy_id)
}

// OG eligibility: the referenced handle name is in the OG set (also admin-datum sourced).
pub fn handle_in_og_list(
  handle_name: ByteArray,
  og_list: List<ByteArray>,
) -> Bool {
  list.has(og_list, handle_name)
}
