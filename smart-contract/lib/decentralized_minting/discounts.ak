use aiken/bytearray
use aiken/merkle_patricia_forestry as mpt
use aiken/pairs
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{PolicyId}

// WS5 — minting-discount eligibility primitives.
//
// Eligibility is proven by *referencing* a qualifying asset (a rare/OG handle, or a partner
// NFT) as a reference input — possession without spending — and checking that the referenced
// asset's holding address shares a credential with the minter's destination. Each class reads
// real on-chain state:
//   - rarity:  the referenced handle's name length (UltraRare = 2, Rare = 3)
//   - OG:      the `og_number` field in the referenced handle's CIP-68 reference-token datum
//   - partner: the referenced asset's policy is in the `$pfp_policy_ids` / `$bg_policy_ids`
//              MPF allowlist root (membership proof), mirroring handles-personalization
// These are the pure checks; wiring them into the mint validator (locate the ref inputs, read
// the allowlist root from the admin datum, apply the discount to the order price) is the
// integration step.

// Possession proof: the qualifying asset's holder and the minter's destination share a
// credential. Payment-credential match OR stake-credential match (both present and equal).
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

// Legendary = 1-char handle (rarer than UltraRare; none minted today, so its bps is 0).
pub fn is_legendary(handle_name: ByteArray) -> Bool {
  bytearray.length(handle_name) == 1
}

pub fn qualifies_for_rarity_discount(handle_name: ByteArray) -> Bool {
  is_legendary(handle_name) || is_ultra_rare(handle_name) || is_rare(handle_name)
}

// H.A.L.-holder eligibility: the referenced asset is under the configured H.A.L. policy.
pub fn is_hal_asset(asset_policy_id: PolicyId, hal_policy_id: PolicyId) -> Bool {
  asset_policy_id == hal_policy_id
}

// CIP-68 reference-token datum: Constr 0 [ metadata: Map<ByteArray,Data>, version, extra ].
// `og_number` is a metadata field (UTF-8 key); legacy sets it > 0 for OG handles, 0 otherwise.
pub type Cip68Datum {
  metadata: Pairs<ByteArray, Data>,
  version: Int,
  extra: Data,
}

const og_number_key: ByteArray = "og_number"

// OG eligibility: read `og_number` from the referenced handle's CIP-68 reference-token datum;
// any value > 0 means OG. Reads chain state directly — no off-chain OG list.
pub fn is_og(reference_datum: Cip68Datum) -> Bool {
  when pairs.get_first(reference_datum.metadata, og_number_key) is {
    Some(og_data) -> {
      expect og_number: Int = og_data
      og_number > 0
    }
    None -> False
  }
}

// Partner-NFT eligibility: the referenced asset's policy is in the partner allowlist MPF root
// (the `$pfp_policy_ids` / `$bg_policy_ids` inline-byte trie read from the admin datum). The
// key is the policy id; `value` + `proof` come from that trie (mirrors handles-personalization
// `verify_policy_approval`). An inclusion proof can't be forged against the committed root.
pub fn partner_policy_in_root(
  allowlist_root: ByteArray,
  policy_id: PolicyId,
  value: ByteArray,
  proof: mpt.Proof,
) -> Bool {
  mpt.from_root(allowlist_root)
    |> mpt.has(policy_id, value, proof)
}
