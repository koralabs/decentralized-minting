# Mainnet cutover prep — DeMi (WS1 label-registry + WS7 fail-closed) + personalization

Status: **PREP / not triggered.** preview ≡ preprod (converged 2026-07-06, `bb057eac`); both green 30/30 on live-cip30. This doc is the runbook to make the mainnet promotion go smoothly. Mainnet deploys need explicit per-deploy auth and MUST NOT be triggered from here.

## 1. Current mainnet state (deployed, queried from api.handle.me/scripts)

DeMi: `demimntprx 6c32db33` · `demimnt 7e6ec18a` · `demimntmpt dae8d5a2` · `demiord 24fe9a2a`
Pers: `perspz 894f24c1` · `persdsg fd65087a` · `perslfc 23a2ef44` · `persprx 7cf10558`

**`deploy/mainnet/decentralized-minting.yaml` is STALE:** its desired `mint_governor`/`minting_data_script_hash`/`order_script_hash` == the deployed hashes above, i.e. it describes the *current, old* contracts, not the target. So mainnet is on **pre-WS1 (no label-asset MPT registry) + pre-WS7 (fail-OPEN `$handle_policies` sunset gate)** DeMi. Preview/preprod are on WS1 + WS7 fail-closed + verbose perspz.

## 2. The two load-bearing risks

### (A) MPT root — the demimntmpt value encoding changed (WS1)
`demimntmpt.ak` WS1: per-handle **label assets (001 settings, …) are recorded in the MPT VALUE** (add label ⟺ mint, remove ⟺ burn) — previously the value was empty. Mainnet's live minting-data MPT root was computed under the OLD encoding. Two distinct migrations, do NOT conflate:
- **Address relocation (planner auto-handles):** after a demimntmpt hash change, the `handle_root@handle_settings` UTxO must move from the old validator address to the new one. `scripts/generateDeploymentPlan.ts` (lines ~232-272) detects this (`mptNeedsMigration`) and emits the migration tx. This just MOVES the UTxO + its existing root datum.
- **Value re-encode / full root recompute (OPEN — decide before cutover):** IF the WS1 value for a handle with *zero* label assets does NOT serialize identically to the old empty value, then every existing mainnet leaf's value changes → the whole root must be recomputed over all handles via `syncMintingDataRoot` ([[feedback_syncmintingdataroot_operator_only]] — MOST dangerous op, operator-only, never without explicit auth). **ACTION: confirm from `smart-contract/validations/minting_data/` whether empty-label-set encodes byte-identically to the pre-WS1 value.** If yes → address-move only (cheap). If no → stage a full re-sync (compute-verify-independently-first per [[feedback_mpt_calculate_independently_first]]; fix at chain layer via `syncMintingDataRoot` per [[feedback_mpt_mismatch_fix_direction]]).

### (B) Observer stake registrations — every upgraded withdraw-0 observer needs its NEW reward account registered
Withdraw-0 validators derive their reward (stake) account from their **script hash**. A withdrawal is only valid if that account is REGISTERED on-chain. When a contract's hash changes on upgrade, its reward account changes → **a stake registration cert must land BEFORE the new observer is first used**. Observers in scope:
- `demimnt` (governor — `demimnt.ak` "withdrawal validator which holds all minting logic")
- `perspz`, `persdsg`, `perslfc` (personalization withdraw-0 observers)
- (`persprx`/`demimntprx`/`demimntmpt`/`demiord` are spend/mint validators, NOT withdraw observers — no stake reg.)
**ACTION: for each observer whose mainnet hash changes, pre-build a stake-registration tx for the new reward address.** Bundle registrations with the ref-script deploy where possible. Do NOT forget these — a withdraw-0 tx against an unregistered reward account fails.

## 3. Cutover sequence (draft — refine after the build)
1. **Build contracts with MAINNET params** (aiken v1.1.22, [[reference_pz_demi_toolchain_truth]] / [[reference_demi_aiken_toolchain]]) → get the new mainnet hashes for demimntmpt (WS1+WS7), demimnt (governor derived from minting-data hash), demiord, demimntprx; and perspz/persdsg/perslfc/persprx if their logic changed.
2. **Update `deploy/mainnet/*.yaml`** to the new target hashes; save BOTH optimized + unoptimized cbor ([[reference_pz_demi_deploy_traces]]) — api serves unoptimized.
3. **Run the plan:** `npm run deployment-plan:mainnet` (added this session; `BLOCKFROST_API_KEY=mainnet…`). Review drift + auto-generated MPT address-migration tx.
4. **Deploy ref scripts** (MANUAL local-planner→Eternl, [[reference_demi_contract_deploy_process]] / MANUAL-DEPLOY-RUNBOOK.md — GH deploy is out of date for DeMi).
5. **Register observer stake accounts** (§2B) — new reward addresses, BEFORE first use.
6. **MPT migration** (§2A): address relocation always; full value re-sync only if the encoding check says so.
7. **Settings update** (mint_governor, minting_data_script_hash, order_script_hash) via operator multisig — mainnet handlecontract signers ([[reference_handlecontract_terminology]], ROOT keyhash `1c8adfe1`).
8. **Verify** with scalus before/after ([[feedback_verify_with_scalus_before_deploy]]); confirm on BOTH mainnet boxes if active/active ([[reference_two_box_deploy_parity]]).

## 4. Pre-stageable NOW (no mainnet writes)
- [x] `deployment-plan:mainnet` npm script added.
- [ ] Build mainnet-param contracts → new hashes → update `deploy/mainnet/*.yaml`.
- [ ] Resolve the §2A encoding question (address-move vs full re-sync).
- [ ] Enumerate which observer hashes actually change (drives §2B).
- [ ] Pre-build (unsigned) the stake-registration + MPT-migration + settings-update txs; scalus-verify.
- [ ] Confirm mainnet infra: box-served ([[reference_mainnet_handle_me_box_serving]]), minting fn memory ([[reference_mainnet_minting_fn_oom]]), partners store AWS-vs-Scylla ([[project_scope03_policy_ids_root_desync]] mainnet-prep note).

## 5. Also promote (net-agnostic, already on preview/preprod)
- **BFF partner-mint ex-units fix** (`1d111f0d`) — fixes production buy-mint on mainnet too ([[reference_buymint_partner_mint_exunits]]).
- **verbose perspz.unoptimized.cbor** — ship a verbose v1.1.22 build to mainnet's api too ([[project_scope03_policy_ids_root_desync]]).
- Note: mainnet live-cip30 is the **read-only mainnet-smoke suite** (never mint outside minting.handle.me); 03b/buy-mint won't run there (no test partners).
