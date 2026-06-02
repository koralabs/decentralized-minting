use aiken/transaction/credential.{
  Address, Inline, ScriptCredential, VerificationKeyCredential,
}
use decentralized_minting/discounts.{
  handle_in_og_list, is_rare, is_ultra_rare, policy_in_allowlist,
  qualifies_for_rarity_discount, shares_credential,
}

fn addr(payment: ByteArray, stake: Option<ByteArray>) -> Address {
  Address {
    payment_credential: VerificationKeyCredential(payment),
    stake_credential: when stake is {
      Some(s) -> Some(Inline(VerificationKeyCredential(s)))
      None -> None
    },
  }
}

// --- shares_credential ---

test same_payment_credential_matches() {
  shares_credential(addr(#"aa", None), addr(#"aa", Some(#"bb")))
}

test same_stake_credential_matches() {
  // different payment, same stake -> match
  shares_credential(addr(#"aa", Some(#"cc")), addr(#"bb", Some(#"cc")))
}

test no_shared_credential() {
  shares_credential(addr(#"aa", Some(#"cc")), addr(#"bb", Some(#"dd"))) == False
}

test both_no_stake_not_a_match() {
  // None/None stake must NOT count as a shared stake credential
  shares_credential(addr(#"aa", None), addr(#"bb", None)) == False
}

test payment_credential_kind_differs() {
  // a vkey payment credential never equals a script one even with same bytes
  let holder =
    Address {
      payment_credential: VerificationKeyCredential(#"aa"),
      stake_credential: None,
    }
  let destination =
    Address {
      payment_credential: ScriptCredential(#"aa"),
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

test rarity_discount_two_or_three() {
  and {
    qualifies_for_rarity_discount("ab"),
    qualifies_for_rarity_discount("abc"),
    qualifies_for_rarity_discount("abcd") == False,
    qualifies_for_rarity_discount("a") == False,
  }
}

// --- allowlists ---

test partner_policy_in_allowlist() {
  policy_in_allowlist(#"beef", [#"dead", #"beef"])
}

test partner_policy_not_in_allowlist() {
  policy_in_allowlist(#"cafe", [#"dead", #"beef"]) == False
}

test og_handle_in_list() {
  handle_in_og_list("alice", ["bob", "alice"])
}

test og_handle_not_in_list() {
  handle_in_og_list("eve", ["bob", "alice"]) == False
}
