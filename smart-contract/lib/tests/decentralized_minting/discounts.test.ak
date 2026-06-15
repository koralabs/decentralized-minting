use aiken/merkle_patricia_forestry as mpt
use cardano/address.{Address, Inline, Script, VerificationKey}
use decentralized_minting/discounts.{
  Cip68Datum, is_legendary, is_og, is_rare, is_ultra_rare,
  partner_policy_in_root, qualifies_for_rarity_discount, shares_credential,
}

fn addr(payment: ByteArray, stake: Option<ByteArray>) -> Address {
  Address {
    payment_credential: VerificationKey(payment),
    stake_credential: when stake is {
      Some(s) -> Some(Inline(VerificationKey(s)))
      None -> None
    },
  }
}

// --- shares_credential ---

test same_payment_credential_matches() {
  shares_credential(addr(#"aa", None), addr(#"aa", Some(#"bb")))
}

test same_stake_credential_matches() {
  shares_credential(addr(#"aa", Some(#"cc")), addr(#"bb", Some(#"cc")))
}

test no_shared_credential() {
  shares_credential(addr(#"aa", Some(#"cc")), addr(#"bb", Some(#"dd"))) == False
}

test both_no_stake_not_a_match() {
  shares_credential(addr(#"aa", None), addr(#"bb", None)) == False
}

test payment_credential_kind_differs() {
  let holder =
    Address {
      payment_credential: VerificationKey(#"aa"),
      stake_credential: None,
    }
  let destination =
    Address {
      payment_credential: Script(#"aa"),
      stake_credential: None,
    }
  shares_credential(holder, destination) == False
}

// --- rarity ---

test ultra_rare_is_two() {
  and {
    is_ultra_rare("ab"),
    is_ultra_rare("abc") == False,
  }
}

test rare_is_three() {
  and {
    is_rare("abc"),
    is_rare("ab") == False,
  }
}

test rarity_discount_one_two_or_three() {
  and {
    qualifies_for_rarity_discount("a"),
    // legendary (1)
    qualifies_for_rarity_discount("ab"),
    // ultra-rare (2)
    qualifies_for_rarity_discount("abc"),
    // rare (3)
    qualifies_for_rarity_discount("abcd") == False,
  }
}

test legendary_is_one() {
  and {
    is_legendary("a"),
    is_legendary("ab") == False,
  }
}

// --- OG: og_number field in the CIP-68 reference-token datum ---

// identity at type Data — coerces a concrete value to Data for heterogeneous metadata maps
fn as_data(x: Data) -> Data {
  x
}

fn cip68_with_og(og_number: Int) -> Cip68Datum {
  Cip68Datum {
    metadata: [
      Pair("name", as_data("$test")),
      Pair("og_number", as_data(og_number)),
    ],
    version: 1,
    extra: as_data(0),
  }
}

test og_number_positive_is_og() {
  and {
    is_og(cip68_with_og(1)),
    is_og(cip68_with_og(250)),
  }
}

test og_number_zero_not_og() {
  is_og(cip68_with_og(0)) == False
}

test missing_og_number_not_og() {
  let datum =
    Cip68Datum {
      metadata: [Pair("name", as_data("$test"))],
      version: 1,
      extra: as_data(0),
    }
  is_og(datum) == False
}

// --- partner: policy in the $pfp_policy_ids / $bg_policy_ids MPF allowlist root ---

const partner_policy = #"beefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef0001"

const other_policy = #"cafecafecafecafecafecafecafecafecafecafecafecafe0002"

test partner_policy_in_allowlist_root() {
  // single-element trie -> empty proof, mirroring handles-personalization
  let trie = mpt.insert(mpt.empty, partner_policy, #"00", [])
  let root = mpt.root(trie)
  partner_policy_in_root(root, partner_policy, #"00", [])
}

test partner_policy_not_in_allowlist_root() {
  let trie = mpt.insert(mpt.empty, partner_policy, #"00", [])
  let root = mpt.root(trie)
  // a different policy can't be proven present against the same root
  partner_policy_in_root(root, other_policy, #"00", []) == False
}
