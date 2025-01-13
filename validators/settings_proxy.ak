use aiken/list
use aiken/pairs
use aiken/cbor
use aiken/bytearray
use aiken/transaction.{InlineDatum, Mint, OutputReference, ScriptContext, Spend}
use aiken/transaction/credential.{Inline, ScriptCredential}
use aiken/transaction/value
use handle/types.{Settings}

validator(init_utxo: OutputReference) {
  pub fn spend(datum: Settings, _r: Data, ctx: ScriptContext) {
    expect Spend(_) = ctx.purpose
    trace bytearray.to_hex(cbor.serialise(pairs.keys(ctx.transaction.withdrawals)))
    expect
      pairs.has_key(
        ctx.transaction.withdrawals,
        Inline(ScriptCredential(datum.settings_governor)),
      )
    True
  }

  pub fn mint(_r: Data, ctx: ScriptContext) {
    trace "Mint"
    expect Mint(own_policy_id) = ctx.purpose
    let expected_mint =
      value.from_asset(own_policy_id, "ADA Handle Settings", 1)
    let mints_exactly_one_settings_nft =
      value.from_minted_value(ctx.transaction.mint) == expected_mint
    let spends_init_utxo =
      list.any(
        ctx.transaction.inputs,
        fn(input) { input.output_reference == init_utxo },
      )
    expect [settings_output] =
      list.filter(
        ctx.transaction.outputs,
        fn(output) { value.without_lovelace(output.value) == expected_mint },
      )
    expect InlineDatum(settings_datum) = settings_output.datum
    expect _: Settings = settings_datum
    and {
      mints_exactly_one_settings_nft,
      spends_init_utxo,
    }
  }
}
