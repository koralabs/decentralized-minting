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

## Engine (PHASE-5)

- ✅ **DSH-501 — DeMi subhandle mint relocated to the orders path. DONE** (engine commit `36b6442`
  on `self-host/local-jwt`; tsc-clean for the sub fn, eslint-clean; dep → `^3.0.1`). Rewrote ONLY
  `processDeMiSubHandleMintingTransaction` to mint under DeMi `6c32db33` via the mint proxy +
  `MintNewHandles` (mirroring the proven root path `processDeMiMintingTransaction`): allowed-minter
  signature, output order `[minting-data, handle-price-info, treasury, minter, ...token (positional)...,
  ...owner-fee...]`, flat fees folded + per-owner royalty outputs in the leftover, rich CIP-68 datums
  + demiord spends + metadata kept, `prepareLegacyMint` untouched (legacy stays `f0ff48bb`).
  - [ ] **REMAINING for you:** (a) the engine push to `origin/self-host/local-jwt` diverged (origin
    advanced) — the commit is on the LOCAL branch on this machine; `git pull --rebase` then push.
    (b) **VERIFY ON-CHAIN (DSH-603)** — there is NO unit-test coverage for this tx builder. Test on
    preview: nft sub (100→pz + 222→dest under 6c32db33), virtual sub (000→pz), owner-fee payout,
    folded minter/treasury, MPT root advance; reproduce any failure with scalus before re-deploy.
    (c) **Free-virtual**: every sub currently takes the PAID path (matches prior behaviour + the BFF
    pricing). To enable the free allowance, the engine needs a per-root current-free-name source
    (its DB or the trie) to call `registryValue.hasFreeSlot/addFreeName` + set `freeVirtual` on the
    `NewHandle` (the package + `prepareNewMintTransaction`/`buildOrderProofs` already do the MPT root
    bump) + the BFF must price under-allowance privates as free. Coordinate both.

- [ ] **DSH-502 — engine burn: NO ENGINE HOME (build with the holder-burn UX, deferred).** The
  engine's burn is HOLDER-INITIATED + tracking-only (`burnHandles.ts` records a holder's burn by
  txHash; `burnConfirm.ts` confirms) — it does not BUILD burn txs. The coordinated DeMi burn tx
  (governor `BurnHandles` withdraw + demimntmpt `BurnNewHandles` + pz `Burn` redeemer, releasing the
  pz-held 100, burning the holder's 222/000) needs cross-deployment (DeMi + pz) refs that belong to
  the holder-burn FRONTEND flow — which is in the project's **Deferred (out of scope)** list. The
  package primitives are READY: `buildBurnProofs` (DSH-404) + `buildMintingDataBurnNewHandlesRedeemer`
  + `buildMintV1BurnHandlesRedeemer` + the pz `Burn` redeemer (DSH-301). Build the tx assembly when
  the holder-burn UX is scoped.

## BFF (PHASE-5) — DSH-503 — COORDINATE WITH THE DSH-601 DEPLOY (do not do standalone)

- [ ] **DSH-503 — `handle.me/bff`.** Attach the `$handle_policies` reference input (the legacy handle
  `handle_policies`, its `(f0ff48bb, lbl_100 ++ "handle_policies")` CIP-68 ref token UTxO) to EVERY
  pz tx the BFF builds. There are **6 separate per-flow `buildTransaction` handlers**, each with its
  own `referenceInputs: Set<TxIn>`: `personalization`, `migrateHandle`, `migrateSubHandleSettings`,
  `buildVirtualSubChangeTx`, `buildRevokeVirtualSubHandlesTx`, `updateSubSettings`. The contract
  **scans** ref inputs for the asset (my `load_handle_policies`), so no index wiring — just `.add()`
  the UTxO to each handler's `referenceInputs`. Fetch it via the bff handle helper
  (`fetchApiJson('handles/handle_policies')` → its UTxO). Also confirm `buy_down` pricing is fully
  removed + the fee display matches the additive owner+minter+treasury model.
  - **⚠ MUST be part of the DSH-601 cutover, NOT standalone:** doing it before the new pz contract is
    deployed (DSH-601) would BREAK production personalization — the `handle_policies` registry handle
    may not exist on the network yet (the fetch fails) and the currently-deployed pz doesn't require
    the ref input. Gate it on the new pz being live (or `try/skip-if-absent`). deps DSH-303 (done) +
    DSH-401 (done, published 3.0.1) + DSH-601 (deploy).

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
