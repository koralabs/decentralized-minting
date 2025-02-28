use aiken/transaction.{ScriptContext, WithdrawFrom}
use aiken/transaction/value.{PolicyId}
use common/hashes.{VerificationKeyHash}
use validations/minting_data_v1.{Proof, can_god_mode, can_mint_or_burn}

// NOTE:
// Proofs must be in same order as minting assets
type MintingDataV1Redeemer {
  // when legacy or new handles are minted/burnt
  MintOrBurn(List<Proof>)
  // god mode - only available to kora lab admins
  GodMode
}

// NOTE:
// This is withdrawal script
// which is referred to as `minting_data_governor` in minting_data_proxy spending script
// This validator contains logic to check
// mpt_root_hash is correctly updated compared to actual minted assets (both legacy and new handles)
//
// ======= Parameters =======
// `god_verification_key_hash` has the authority to spend minting_data_asset
// without actually minting assets
// `legacy_policy_id`: Legacy Handle's Policy ID
//
validator(
  legacy_policy_id: PolicyId,
  god_verification_key_hash: VerificationKeyHash,
) {
  fn withdraw(redeemer: MintingDataV1Redeemer, ctx: ScriptContext) -> Bool {
    let ScriptContext(transaction, purpose) = ctx
    expect WithdrawFrom(_) = purpose

    when redeemer is {
      MintOrBurn(proofs) ->
        can_mint_or_burn(transaction, proofs, legacy_policy_id)
      GodMode -> can_god_mode(transaction, god_verification_key_hash)
    }
  }
}
