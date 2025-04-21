use aiken/transaction.{ScriptContext, Spend}
use aiken/transaction/value.{PolicyId}
use common/hashes.{VerificationKeyHash}
use validations/minting_data/types.{Proof}
use validations/minting_data/validation.{can_mint_handles, can_update_mpt}

type MintingDataRedeemer {
  MintHandles(List<Proof>)
  // Update MPT
  UpdateMPT
}

// NOTE:
// This is spending validator
// It is referred to as `minting_data_script_hash` in SettingsV1
// This validators locks minting_data_asset
// which holds the MPT root hash (of all handles) in its datum
// To mint handles, you must spend minting_data_asset from here
//
// This validator contains almost all logic for decentralized minting
//
// ======= Parameters =======
// `legacy_policy_id`: Legacy Handle's Policy ID
// `admin_verification_key_hash`: has the authority to spend minting_data_asset
// without actually minting assets
//
// datum type is Data because when minting data asset is sent with wrong datum
// still can recover asset
//
validator(
  legacy_policy_id: PolicyId,
  admin_verification_key_hash: VerificationKeyHash,
) {
  fn spend(
    _minting_data: Data,
    redeemer: MintingDataRedeemer,
    ctx: ScriptContext,
  ) {
    let ScriptContext(transaction, purpose) = ctx
    expect Spend(spending_output_reference) = purpose

    when redeemer is {
      MintHandles(proofs) ->
        can_mint_handles(
          transaction,
          spending_output_reference,
          proofs,
          legacy_policy_id,
        )
      UpdateMPT -> can_update_mpt(transaction, admin_verification_key_hash)
    }
  }
}
