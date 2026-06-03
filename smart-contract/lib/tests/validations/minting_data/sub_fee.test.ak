use aiken/bytearray
use aiken/transaction.{InlineDatum, Input, Output, OutputReference,
  TransactionId}
use aiken/transaction/credential.{from_verification_key}
use aiken/transaction/value
use common/cip68.{prefix_001}
use validations/minting_data/types.{LegacyHandleProof}
use validations/minting_data/utils.{sub_handle_kora_fee_total}

const legacy_policy = #"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"

const new_policy = #"00000000000000000000000000000000000000000000000000000001"

fn as_data(x: Data) -> Data {
  x
}

// reference input holding the root's 001 OwnerSettings (nft len1=100M, virtual len1=2M)
fn owner_settings_ref(root: ByteArray) -> Input {
  let nft = (0, 1, [(1, 100_000_000)], as_data(0), 0)
  let virtual = (0, 1, [(1, 2_000_000)], as_data(0), 0)
  let owner_settings = (nft, virtual, 0, 0, 0, as_data(0), 0, #"")
  Input {
    output_reference: OutputReference {
      transaction_id: TransactionId { hash: #"cc" },
      output_index: 0,
    },
    output: Output {
      address: from_verification_key(#"00"),
      value: value.zero()
        |> value.add(legacy_policy, bytearray.concat(prefix_001, root), 1),
      datum: InlineDatum(owner_settings),
      reference_script: None,
    },
  }
}

fn proof(handle: ByteArray, is_virtual: Int) -> LegacyHandleProof {
  LegacyHandleProof { mpt_proof: [], handle_name: handle, is_virtual }
}

fn fee(proofs: List<LegacyHandleProof>, refs: List<Input>) -> Int {
  sub_handle_kora_fee_total(proofs, refs, new_policy, legacy_policy, 10)
}

// virtual sub "a@root": virtual price (len 1) = 2_000_000; 10% = 200_000 -> floored to min 2_000_000
test fee_for_virtual_sub() {
  fee([proof("a@root", 1)], [owner_settings_ref("root")]) == 2_000_000
}

// nft sub "a@root": nft price (len 1) = 100_000_000; 10% treasury = 10_000_000
test fee_for_nft_sub() {
  fee([proof("a@root", 0)], [owner_settings_ref("root")]) == 10_000_000
}

// a root legacy handle owes no on-chain fee (priced off-chain)
test fee_zero_for_root_handle() {
  fee([proof("root", 0)], []) == 0
}

// two nft subs of the same root -> summed
test fee_sums_across_subs() {
  fee([proof("a@root", 0), proof("ab@root", 0)], [owner_settings_ref("root")]) == 20_000_000
}

// subhandle whose root settings aren't referenced -> fails (can't fake a free mint)
test fee_missing_settings_ref_fails() fail {
  fee([proof("a@root", 1)], []) == 0
}
