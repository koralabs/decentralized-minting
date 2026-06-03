use aiken/bytearray
use aiken/merkle_patricia_forestry as mpt
use aiken/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, TransactionId,
}
use aiken/transaction/credential.{
  Address, Inline, VerificationKeyCredential, from_verification_key,
}
use aiken/transaction/value
use common/cip68.{prefix_100, prefix_222}
use decentralized_minting/discount.{
  DiscountConfig, HalClaim, OgClaim, PartnerClaim, RarityClaim,
}
use decentralized_minting/discounts.{Cip68Datum}
use validations/discount_eligibility.{discount_bps_for_claim}

const legacy_policy =
  #"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"

const new_policy = #"00000000000000000000000000000000000000000000000000000001"

const hal_policy = #"00000000000000000000000000000000000000000000000000000002"

const partner_policy =
  #"00000000000000000000000000000000000000000000000000000003"

// holder + destination share a stake credential (possession proof passes)
fn holder_addr() -> Address {
  from_verification_key(#"aa") |> with_stake(#"cc")
}

fn destination() -> Address {
  from_verification_key(#"bb") |> with_stake(#"cc")
}

fn unrelated_addr() -> Address {
  from_verification_key(#"dd") |> with_stake(#"ee")
}

fn with_stake(addr: Address, stake: ByteArray) -> Address {
  Address {
    ..addr,
    stake_credential: Some(Inline(VerificationKeyCredential(stake))),
  }
}

fn config() -> DiscountConfig {
  DiscountConfig {
    partner_nft_bps: 5000,
    hal_bps: 4000,
    og_bps: 7500,
    legendary_bps: 9000,
    ultra_rare_bps: 3000,
    rare_bps: 2000,
    free_virtual_count: 3,
    hal_policy_id: hal_policy,
  }
}

fn ref_input(addr: Address, policy: ByteArray, name: ByteArray, datum) -> Input {
  Input {
    output_reference: OutputReference {
      transaction_id: TransactionId { hash: #"aa" },
      output_index: 0,
    },
    output: Output {
      address: addr,
      value: value.zero() |> value.add(policy, name, 1),
      datum,
      reference_script: None,
    },
  }
}

fn owner_222(handle: ByteArray, addr: Address) -> Input {
  ref_input(addr, legacy_policy, bytearray.concat(prefix_222, handle), NoDatum)
}

fn bps(claim, refs, root) -> Int {
  discount_bps_for_claim(
    claim,
    refs,
    destination(),
    config(),
    legacy_policy,
    new_policy,
    root,
  )
}

// --- no claim ---

test no_claim_is_zero() {
  bps(None, [], #"") == 0
}

// --- rarity ---

test rarity_ultra_rare() {
  let refs =
    [owner_222("ab", holder_addr())]
  bps(Some(RarityClaim { handle_name: "ab" }), refs, #"") == 3000
}

test rarity_legendary() {
  let refs =
    [owner_222("a", holder_addr())]
  bps(Some(RarityClaim { handle_name: "a" }), refs, #"") == 9000
}

test rarity_rare() {
  let refs =
    [owner_222("abc", holder_addr())]
  bps(Some(RarityClaim { handle_name: "abc" }), refs, #"") == 2000
}

// forged: handle not actually referenced
test rarity_not_referenced_fails() fail {
  bps(Some(RarityClaim { handle_name: "ab" }), [], #"") == 0
}

// forged: holder doesn't share a credential with the destination
test rarity_unshared_credential_fails() fail {
  let refs =
    [owner_222("ab", unrelated_addr())]
  bps(Some(RarityClaim { handle_name: "ab" }), refs, #"") == 0
}

// forged: 4-char handle isn't rare
test rarity_not_rare_fails() fail {
  let refs =
    [owner_222("abcd", holder_addr())]
  bps(Some(RarityClaim { handle_name: "abcd" }), refs, #"") == 0
}

// --- OG (222 ownership + 100 ref datum og_number > 0) ---

fn cip68_og(n: Int) -> Cip68Datum {
  let metadata: Pairs<ByteArray, Data> =
    [Pair("og_number", as_data(n))]
  Cip68Datum { metadata, version: 1, extra: as_data(0) }
}

fn as_data(x: Data) -> Data {
  x
}

fn og_100(handle: ByteArray, n: Int) -> Input {
  ref_input(
    from_verification_key(#"99"),
    legacy_policy,
    bytearray.concat(prefix_100, handle),
    InlineDatum(cip68_og(n)),
  )
}

test og_claim_ok() {
  let refs =
    [owner_222("alice", holder_addr()), og_100("alice", 5)]
  bps(Some(OgClaim { handle_name: "alice" }), refs, #"") == 7500
}

// not actually OG (og_number 0) -> rejected
test og_claim_zero_fails() fail {
  let refs =
    [owner_222("alice", holder_addr()), og_100("alice", 0)]
  bps(Some(OgClaim { handle_name: "alice" }), refs, #"") == 0
}

// --- HAL ---

test hal_claim_ok() {
  let refs =
    [ref_input(holder_addr(), hal_policy, "halnft", NoDatum)]
  bps(Some(HalClaim { asset_name: "halnft" }), refs, #"") == 4000
}

test hal_wrong_policy_fails() fail {
  // asset under a non-HAL policy -> not found under hal_policy_id
  let refs =
    [ref_input(holder_addr(), new_policy, "halnft", NoDatum)]
  bps(Some(HalClaim { asset_name: "halnft" }), refs, #"") == 0
}

// --- partner (MPF membership in the allowlist root) ---

test partner_claim_ok() {
  let trie = mpt.insert(mpt.empty(), partner_policy, #"00", [])
  let root = mpt.root(trie)
  let refs =
    [ref_input(holder_addr(), partner_policy, "pnft", NoDatum)]
  bps(
    Some(
      PartnerClaim {
        policy_id: partner_policy,
        asset_name: "pnft",
        value: #"00",
        proof: [],
      },
    ),
    refs,
    root,
  ) == 5000
}

// policy not in the allowlist root -> rejected
test partner_not_in_root_fails() fail {
  let trie = mpt.insert(mpt.empty(), partner_policy, #"00", [])
  let root = mpt.root(trie)
  let refs =
    [ref_input(holder_addr(), new_policy, "pnft", NoDatum)]
  bps(
    Some(
      PartnerClaim {
        policy_id: new_policy,
        asset_name: "pnft",
        value: #"00",
        proof: [],
      },
    ),
    refs,
    root,
  ) == 0
}
