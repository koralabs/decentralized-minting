# User Actions Checklist

Concrete user-owned items + handoffs. Status as of 2026-06-06 (overnight unattended run).

## ✅ Resolved this run (no action needed)

- ✅ **DSH-300 pz baseline** — FIXED (commit `41da152`, branch `parity/demi-pz-policy-burn`). The
  failing test built Aiken Constr records where the validator parses the Helios-era raw `List<Data>`
  on-chain form; rebuilt the fixtures. pz now **125 checks / 0 errors**. This unblocked the whole pz
  chain (DSH-301/302/303 all done: `$handle_policies` reader + nft/root burn redeemer + decentralized
  personalize/migrate/revoke — pz now **140 checks / 0 errors**).
- ✅ **Package published** — `@koralabs/handles-decentralized-minting@3.0.0` then **`3.0.1`** (the
  engine-facing API: `prepareNewMintDataSpend`, `buildOrderProofs`, `buildBurnProofs`,
  `buildMintNewHandlesPlan`) published via the GitHub publish workflow (fast-forwarded `master` to
  `parity/legacy-parity-foundation`). Verify the `3.0.1` run went green:
  `gh run list --workflow=publish.yml -L1` in `decentralized-minting`.

## Engine (PHASE-5) — DSH-501 mint + DSH-502 burn — SPEC, needs implementation + on-chain verify

> The agent did NOT blind-write these: `processDeMiSubHandleMintingTransaction` is a ~300-line
> **money-critical** path with **no unit-test coverage** (the engine test file only covers
> session/order pairing), so it is verifiable ONLY on-chain (DSH-603). The package side is done +
> published; below is the precise relocation spec. Do it on the engine's current branch
> `self-host/local-jwt` (per your call), separate commits, don't touch the untracked
> `signDemiSettingsUpdate.ts`.

- [ ] **DSH-501 — relocate `processDeMiSubHandleMintingTransaction` (ONLY this fn) to the orders
  path.** Bump the engine dep to `@koralabs/handles-decentralized-minting@^3.0.1` first. Changes:
  1. **Minting-data spend:** replace the `prepareLegacyMintTransaction` call with the new
     `prepareNewMintDataSpend({ changeAddress, minterKeyHash, minterIndex, handles, collateralUtxo,
     db, blockfrostApiKey })`. `handles` are `NewHandle[]` (set `isVirtual` from `subHandleType`;
     set `freeVirtual: { rootFreeNames, rootLabels }` for FREE private virtuals — see step 5). It
     returns `{ plan, deployedScripts, settingsV1, newMintingData }` with the `MintNewHandles`
     redeemer + the MPT-root-updated minting-data output. Do NOT modify `prepareLegacyMint`; legacy
     subhandles keep minting on `f0ff48bb` via the untouched legacy path.
  2. **Mint under DeMi `6c32db33` via the mint PROXY (not `f0ff48bb` native):** `policyId =
     deployedScripts.mintProxyScript.details.validatorHash`. Build the `mint` map + the token-output
     asset names (000/100/222) under that policyId. Add the mint-proxy ref script to the reference
     inputs and a VOID mint redeemer (`{constructor:0,fields:[]}`, purpose `mint`, index 0). REMOVE
     the `nativeScript: [nativeScript]` and the `f0ff48bb` native-mint authorization.
  3. **Authorization/signers:** the `MintNewHandles` validator checks `signed by allowed_minter`, so
     the required signer is the **allowed minter** (`approvedMinterWallet` idx 13 ==
     `settings.allowed_minters[minterIndex]`), gated by the existing `mint_v1` (governor) withdrawal
     + the mint proxy. Sign with the wallets that actually need to sign (allowed-minter; the admin
     policy key is no longer the mint authorizer).
  4. **OUTPUT ORDER IS LOAD-BEARING (the orders path consumes token outputs POSITIONALLY):** final
     `outputs` MUST be `[ minting-data, ...per-order token outputs (in order-input order)...,
     ...owner-fee outputs... ]`. The current legacy code appends `feeOutputs` (from
     `prepareLegacyMint`) BEFORE the token `extraOutputs` — that order is WRONG for MintNewHandles
     and must be flipped: token outputs FIRST, owner-fee outputs in the LEFTOVER after them. The flat
     minter/treasury fold into the batch minter/treasury outputs (Design A). **Re-derive the exact
     fixed-output prefix + fee-output placement from the contract `can_mint_new_handles` +
     `owner_fees_all_paid` (`smart-contract/lib/validations/minting_data/{validation,utils}.ak`)
     before trusting any ordering** — this is the #1 place a subtle error fails on-chain.
  5. **Free-virtual:** the engine decides free-vs-paid per private virtual via
     `registryValue.hasFreeSlot(rootFreeNames, settingsV1.free_virtual_count)` against the root's
     current free-name set (engine-tracked). FREE ones: pass `freeVirtual` on the `NewHandle` AND
     bump the tracked set with `addFreeName`. Write the free-virtual sub NAMES into the tx metadata
     (chain-as-source-of-truth). `prepareNewMintDataSpend` builds the root free_names bump in the MPT
     automatically via `buildOrderProofs`.
  6. **Keep:** the rich CIP-68 token-output datums (`buildPlutusData`), the demiord OrderExecute
     spends, the `mint_v1` withdrawal, `finalizeTxPlanWithAuxiliaryData`, the metadata.
  - **Verify (DSH-603, on-chain, preview):** nft sub mint (100→pz + 222→dest under 6c32db33), virtual
    sub mint (000→pz), owner-fee payout to the owner `payment_address`, folded minter/treasury, 3
    free virtuals then the 4th paid, and that the MPT root advanced. Reproduce any failure with the
    scalus evaluator before re-deploying.

- [ ] **DSH-502 — engine burn.** Build the coordinated DeMi burn tx via `buildBurnProofs(db,
  handles)` (BurnProof[] + trie delete + free-name reopen) + `buildMintingDataBurnNewHandlesRedeemer`
  (demimntmpt constr 5) + the governor `buildMintV1BurnHandlesRedeemer` withdrawal + the pz `Burn`
  redeemer (releases the pz-held 100 iff the 222 is burned + policy ∈ `$handle_policies`), all in one
  tx, burning −1 of the tokens. Needs BOTH the DeMi and pz deployments' script refs. deps DSH-404
  (done, pkg) + DSH-501.

## BFF (PHASE-5) — DSH-503 — ready, lower-risk

- [ ] **DSH-503 — `handle.me/bff`.** Once the new pz contract requires the `$handle_policies`
  reference input (DSH-303), attach that admin-handle reference input (the legacy handle
  `handle_policies`, its `(f0ff48bb, lbl_100 ++ "handle_policies")` CIP-68 ref token UTxO) to EVERY
  personalization tx the BFF builds — existing personalize/migrate flows included, or they break.
  Confirm `buy_down` pricing is fully removed + the fee display matches the additive
  owner+minter+treasury model. deps DSH-303 (done) + DSH-401 (done, published 3.0.1).

## Deploy (PHASE-6) — needs your signing / on-chain actions

- [ ] **DSH-601 — deploy the new pz contract version** (`handles-personalization` +
  api). The pz changes (new `Burn` redeemer → new validator hashes for `perspz`/`perslfc`) require
  deploying a new pz contract version + registering the new `persprx`/observer hashes in the api
  script registry so DeMi handles resolve to it. Regenerate the pz blueprints first (the ABI changed:
  `aiken build` with v1.1.21 in `handles-personalization/aiken`). Branch `parity/demi-pz-policy-burn`.
  Follows the personalization deploy process (on-chain deploy + signing the agent can't do unattended).

- [ ] **DSH-602 — deploy DeMi (multisig).** Regenerate the Phase-1 bundle (new `demimntmpt`/`demimnt`
  hashes — already in the regenerated blueprints, DSH-406); ALSO regenerate the stale
  `deploy/preview/*.unoptimized.cbor` artifacts (demimnt/demimntmpt changed). Publish is already
  done (3.0.1). **You sign `tx-01/02/03` in Eternl** with your handlecontract key (1-of-2
  `RequireAnyOf`, members `5b468ea6` / `d9980af9` — agent holds neither). **You asked for the
  transaction hex** — the deploy-plan generator emits unsigned tx hex to the artifacts dir
  (`npm run deployment-plan:preview` → `tmp/.../tx-XX.cbor[.hex]`); the agent will surface those hex
  files when the bundle is regenerated. Agent co-signs fee inputs (POLICY_KEY idx 12) + the MPT-root
  migration (admin/policy root `4da965a0`).

- [ ] **DSH-603 — on-chain verification (preview)** of the full mint + burn after DSH-602 deploys.
  See the DSH-501 verify checklist above + burn (nft 222-check, virtual `Revoke`, MPT delete,
  free-name reopen).

## Branches / artifacts summary

- `decentralized-minting`: `parity/legacy-parity-foundation` (pushed; == `master`; published 3.0.1).
- `handles-personalization`: `parity/demi-pz-policy-burn` (pushed; 140 checks/0 — needs deploy DSH-601).
- `minting.handle.me`: engine work pending on `self-host/local-jwt` (DSH-501/502 spec above).
- `handle.me/bff`: DSH-503 pending.
