use aiken/bytearray
use aiken/transaction/credential.{ScriptCredential, VerificationKeyCredential}
use decentralized_minting/sub_handle.{
  get_sub_handle_price_from_tier_pricing, owner_payment_credential,
}

// 28-byte credential hashes for the address-parsing tests.
fn vkh28() -> ByteArray {
  #"0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c"
}

fn stake28() -> ByteArray {
  #"1c1b1a191817161514131211100f0e0d0c0b0a090807060504030201"
}

// Enterprise key address (header type 6, payment = key): header bit 4 unset -> VerificationKey.
test owner_credential_enterprise_key() {
  owner_payment_credential(bytearray.concat(#"60", vkh28())) == VerificationKeyCredential(
    vkh28(),
  )
}

// Enterprise script address (header type 7, payment = script): header bit 4 set -> Script.
test owner_credential_enterprise_script() {
  owner_payment_credential(bytearray.concat(#"70", vkh28())) == ScriptCredential(
    vkh28(),
  )
}

// Base address (header type 0): payment credential is bytes 1..28, stake part ignored.
test owner_credential_base_addr_payment_only() {
  let addr = bytearray.concat(#"00", bytearray.concat(vkh28(), stake28()))
  owner_payment_credential(addr) == VerificationKeyCredential(vkh28())
}

fn tier_pricing_0() -> List<(Int, Int)> {
  [(1, 100_000_000), (3, 50_000_000), (6, 5_000_000)]
}

test get_sub_handle_price_from_tier_pricing_0() {
  get_sub_handle_price_from_tier_pricing(tier_pricing_0(), 1) == 100_000_000
}

test get_sub_handle_price_from_tier_pricing_1() {
  get_sub_handle_price_from_tier_pricing(tier_pricing_0(), 2) == 100_000_000
}

test get_sub_handle_price_from_tier_pricing_2() {
  get_sub_handle_price_from_tier_pricing(tier_pricing_0(), 3) == 50_000_000
}

test get_sub_handle_price_from_tier_pricing_3() {
  get_sub_handle_price_from_tier_pricing(tier_pricing_0(), 5) == 50_000_000
}

test get_sub_handle_price_from_tier_pricing_4() {
  get_sub_handle_price_from_tier_pricing(tier_pricing_0(), 6) == 5_000_000
}

test get_sub_handle_price_from_tier_pricing_5() {
  get_sub_handle_price_from_tier_pricing(tier_pricing_0(), 7) == 5_000_000
}

test get_sub_handle_price_from_tier_pricing_6() {
  get_sub_handle_price_from_tier_pricing(tier_pricing_0(), 10) == 5_000_000
}

// A zero-priced tier yields a 0 owner royalty (no `price > 0` assertion) — the flat minter +
// treasury fees still apply separately and are enforced in minting_data/validation.
test get_sub_handle_price_zero_tier_ok() {
  get_sub_handle_price_from_tier_pricing([(1, 0)], 4) == 0
}
