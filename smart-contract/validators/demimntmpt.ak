use aiken/transaction.{ScriptContext, Spend}
use aiken/transaction/value.{PolicyId}
use common/hashes.{VerificationKeyHash}
use validations/minting_data/types.{
  BurnProof, LabelAssetProof, LegacyHandleProof, OrderProof,
}
use validations/minting_data/validation.{
  can_burn_legacy_handles, can_burn_new_handles, can_mint_label_assets,
  can_mint_legacy_handles, can_mint_new_handles, can_update_mpt,
}

// NOTE: constructor order is part of the on-chain ABI — the off-chain redeemer builders encode
// these indices. New variants are APPENDED after `UpdateMPT` so existing indices (0–2) are
// preserved: MintNewHandles=0, MintLegacyHandles=1, UpdateMPT=2, BurnLegacyHandles=3,
// MintLabelAssets=4, BurnNewHandles=5.
type MintingDataRedeemer {
  MintNewHandles(List<OrderProof>, Int)
  MintLegacyHandles(List<LegacyHandleProof>)
  // Update MPT
  UpdateMPT
  // WS2: Burn legacy handles (e.g. virtual sub handles) and delete them from the MPT
  BurnLegacyHandles(List<LegacyHandleProof>)
  // WS1: mint/burn per-handle label assets (001 settings, …) and record them in the
  // MPT value (add label ⟺ mint, remove ⟺ burn). Int = minter_index.
  MintLabelAssets(List<LabelAssetProof>, Int)
  // Burn DeMi-policy handles (root, nft sub, virtual sub): delete from the MPT, burn the tokens,
  // reopen a free virtual's slot. Gated by the governor (can_burn_handles) + the pz contract.
  BurnNewHandles(List<BurnProof>)
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
// `anchor_slot` / `anchor_time_ms` / `slot_length_ms`: the network's slot->POSIX-time anchor,
// used by WS7's `$handle_policies` sunset gate to convert the slot-based window to the POSIX-ms
// domain of the tx validity range. Network-specific (mainnet/preprod/preview differ) — supplied
// at deploy. Only consequential once a sunset slot is set; the gate is open until then.
validator(
  legacy_policy_id: PolicyId,
  admin_verification_key_hash: VerificationKeyHash,
  anchor_slot: Int,
  anchor_time_ms: Int,
  slot_length_ms: Int,
) {
  fn spend(
    _minting_data: Data,
    redeemer: MintingDataRedeemer,
    ctx: ScriptContext,
  ) {
    let ScriptContext(transaction, purpose) = ctx
    expect Spend(spending_output_reference) = purpose

    when redeemer is {
      MintNewHandles(proofs, minter_index) ->
        can_mint_new_handles(
          transaction,
          spending_output_reference,
          proofs,
          minter_index,
          legacy_policy_id,
          anchor_slot,
          anchor_time_ms,
          slot_length_ms,
        )
      MintLegacyHandles(proofs) ->
        can_mint_legacy_handles(
          transaction,
          spending_output_reference,
          proofs,
          legacy_policy_id,
          anchor_slot,
          anchor_time_ms,
          slot_length_ms,
        )
      BurnLegacyHandles(proofs) ->
        can_burn_legacy_handles(
          transaction,
          spending_output_reference,
          proofs,
          legacy_policy_id,
        )
      MintLabelAssets(proofs, minter_index) ->
        can_mint_label_assets(
          transaction,
          spending_output_reference,
          proofs,
          legacy_policy_id,
          minter_index,
        )
      UpdateMPT -> can_update_mpt(transaction, admin_verification_key_hash)
      BurnNewHandles(proofs) ->
        can_burn_new_handles(transaction, spending_output_reference, proofs)
    }
  }
}
