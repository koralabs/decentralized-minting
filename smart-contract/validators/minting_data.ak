use aiken/transaction.{ScriptContext, Spend}
use aiken/transaction/value.{PolicyId}
use common/hashes.{VerificationKeyHash}
use validations/minting_data/types.{Proof}
use validations/minting_data/validation.{can_god_mode, can_mint_or_burn}

pub type MintingDataRedeemer {
  // when legacy or new handles are minted/burnt
  MintOrBurnNewHandles(List<Proof>)
  MintOrBurnLegacyHandles(List<Proof>)
  // god mode - only available to kora lab admins
  GodMode
}

// NOTE:
// This is spending validator
// It is referred to as `minting_data_script_hash` in SettingsV1
// This validators locks minting_data_asset
// which holds the MPT root hash (of all handles) in its datum
// To mint new decentralized handles, you must spend minting_data_asset from here
//
// This validator contains logic to check
// mpt_root_hash is correctly updated compared to actual minted assets (both legacy and new handles)
//
// ======= Parameters =======
// `god_verification_key_hash` has the authority to spend minting_data_asset
// without actually minting assets
// `legacy_policy_id`: Legacy Handle's Policy ID
//
// datum type is Data because when minting data asset is sent with wrong datum
// still can recover asset
//
validator(
  legacy_policy_id: PolicyId,
  god_verification_key_hash: VerificationKeyHash,
) {
  pub fn spend(
    _minting_data: Data,
    redeemer: MintingDataRedeemer,
    ctx: ScriptContext,
  ) {
    let ScriptContext(transaction, purpose) = ctx
    expect Spend(spending_output_reference) = purpose

    when redeemer is {
      MintOrBurnNewHandles(proofs) ->
        can_mint_or_burn(
          transaction,
          spending_output_reference,
          proofs,
          legacy_policy_id,
          True,
        )
      MintOrBurnLegacyHandles(proofs) ->
        can_mint_or_burn(
          transaction,
          spending_output_reference,
          proofs,
          legacy_policy_id,
          False,
        )
      GodMode -> can_god_mode(transaction, god_verification_key_hash)
    }
  }
}
