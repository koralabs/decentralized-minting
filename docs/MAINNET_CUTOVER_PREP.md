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
- **Value re-encode / full root recompute (RESOLVED 2026-07-22 — empty set IS byte-identical):** the WS1 value for a handle with zero label assets serializes to zero-length bytes, exactly the pre-WS1 value. Evidence: `lib/decentralized_minting/registry_value.ak` `encode` is identity ("An empty handle stays `#\"\"`"), `lib/validations/minting_data/utils.ak:719` still inserts handle keys with `#""`, klc `src/mpt/index.ts:47-51` maps `labels:''` → value `''` (0 bytes; MPF hashes `blake2b_256(value)` identically for `''`/empty Buffer — local trie test: identical roots, non-empty control differs). **On-chain precedent: preprod made this EXACT hop from the same validator mainnet runs (`dae8d5a2`) with the root datum byte-identical in/out** — tx `78bb46f1911c621a4106aed72fb0dc68b3dea8955ac72eca874eaa27f0371dcf` (dae8d5a2→d20ad084, root `49694c06…` unchanged), then WS7 hop `524efc473f…` (d20ad084→9c3fcd4b, root `f3791cb9…` unchanged). → **Address-move only.** TWO caveats that can still force a re-encode:
  1. **Sequencing:** the planner's `computeMptRootHash` fetches `GET /mpt-root/registry-labels` and ABORTS on failure (`src/deploymentPlan.ts:72-77`); mainnet's deployed api is pre-WS1 and 404s that route → **deploy the WS1-aware api to mainnet BEFORE running `deployment-plan:mainnet`**, and do NOT full-reimport it before the migration lands (see 2).
  2. **Historical 001s are a reimport time-bomb:** pre-WS1-minted 001 assets exist on mainnet (e.g. `hosky` `f0ff…00001070686f736b79`, qty 1) and preprod (≥8: ada.handle, 247, 25, book, cic, …) but are in NEITHER the chain trie values NOR the api registry map — consistent only because the store never re-scanned history. The scanner auto-registers any tracked label it processes (`api handlesRepository.ts:1111` `ensureLabel`), so a full-history reimport flips the calculated root → `verified:false` → mint deadlock → forced `syncMintingDataRoot`. Preview BACKFILLED (its root folds 193 labels incl. historical); preprod started EMPTY (20 e2e-only) — the two nets are semantically divergent here. Decide the mainnet stance at cutover: fold historical 001s into the migration root (planner already writes the recomputed root — a one-tx re-encode, preview-style), or accept preprod's empty-start + never full-reimport without a paired root re-sync.

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
6. **MPT migration** (§2A): address relocation always; empty-set encoding is byte-identical (RESOLVED above), so no re-sync is forced by the encoding — but honor the §2A caveats (WS1 api deployed first; historical-001 stance decided).
7. **Settings update** (mint_governor, minting_data_script_hash, order_script_hash) via operator multisig — mainnet handlecontract signers ([[reference_handlecontract_terminology]], ROOT keyhash `1c8adfe1`).
8. **Verify** with scalus before/after ([[feedback_verify_with_scalus_before_deploy]]); confirm on BOTH mainnet boxes if active/active ([[reference_two_box_deploy_parity]]).

## 4. Pre-stageable NOW (no mainnet writes)
- [x] `deployment-plan:mainnet` npm script added.
- [ ] Build mainnet-param contracts → new hashes → update `deploy/mainnet/*.yaml`.
- [x] Resolve the §2A encoding question → **address-move only** (empty set byte-identical; preprod precedent tx `78bb46f1…`). Remaining §2A decisions: api-deploy-before-plan sequencing + the historical-001 backfill stance.
- [ ] Enumerate which observer hashes actually change (drives §2B).
- [ ] Pre-build (unsigned) the stake-registration + MPT-migration + settings-update txs; scalus-verify.
- [ ] Confirm mainnet infra: box-served ([[reference_mainnet_handle_me_box_serving]]), minting fn memory ([[reference_mainnet_minting_fn_oom]]), partners store AWS-vs-Scylla ([[project_scope03_policy_ids_root_desync]] mainnet-prep note).

## 5. Also promote (net-agnostic, already on preview/preprod)
- **BFF partner-mint ex-units fix** (`1d111f0d`) — fixes production buy-mint on mainnet too ([[reference_buymint_partner_mint_exunits]]).
- **verbose perspz.unoptimized.cbor** — ship a verbose v1.1.22 build to mainnet's api too ([[project_scope03_policy_ids_root_desync]]).
- Note: mainnet live-cip30 is the **read-only mainnet-smoke suite** (never mint outside minting.handle.me); 03b/buy-mint won't run there (no test partners).

## 6. Wave-1 readiness-audit findings (2026-07-22) — sequencing + staging facts

**New mainnet target hashes (built + planner-verified this session; yaml updated):**
`demimntprx 6c32db33` (frozen, unchanged) · `demimntmpt f2799138a412ce749f50fab3ae1537400cc3ce7099bbd850a6dec03c` · `demimnt 83d1a3c701d88332edad6df0cc0cffcb7412be02774d38ff33e2302b` · `demiord d9b3709892158087eceb93c4fd46d112d1f81c76a874e052d1e671cb` (network-independent — equals preprod). Pers targets (network-independent, == preview/preprod): `perspz e30bd311 · persdsg 1fcfe6fd · perslfc a700056e`; `persprx 7cf10558` unchanged.
Planner dry-run artifacts: `/tmp/decentralized-minting-plan` (plan_id `9db57d2e…`, tx-01 demimntmpt2 redeploy, tx-02 demiord1 redeploy) — **rebuild WITH `HANDLECONTRACT_NATIVE_SCRIPT_CBOR` before signing** (see MANUAL-DEPLOY-RUNBOOK; artifacts built without it are not Eternl-importable).

**HARD ORDERING (violating any of these breaks live mainnet):**
1. **api.handle.me (WS1-aware) deploys FIRST** — the planner's `computeMptRootHash` needs `GET /mpt-root/registry-labels` (mainnet currently 404s it), and the BFF's fold/revoke flows need it too. Do NOT full-history-reimport the api before the MPT migration lands (historical-001 time bomb, §2A).
2. **minting engine (minting.handle.me) BEFORE or atomic with the BFF**: mainnet engine lacks `GET /sessionStatus` (preview BFF 503s every reservation without it) and pins SDK 2.0.3 which cannot decode the 5-field OrderDatum the preview BFF emits. Ship the engine's mainnet branch (sessionStatus + vendored SDK 3.x) first; smoke-test `/sessionStatus` before BFF cutover.
3. **DeMi contracts (WS1/WS7) + MPT address-move + settings update BEFORE the frontend/BFF promote** — the promoted UI un-gates DeMi SubHandle flows (bff.handle.me/state already returns demiMinting+subHandles true); on pre-WS1 contracts those flows strand user funds in demiord orders. No feature flag exists (decision recorded: sequence instead of gate).
4. **bff + static promote atomically** — preview static sends gzip-base64 tx bodies (`x-kora-body-encoding`) that the old BFF can't decode.
5. **Stake registrations land BEFORE first observer use**: new demimnt `83d1a3c7` (legacy StakeRegistration cert — no publish handler); pers trio (Conway reg_cert + publish redeemer, one tx like preprod's `9416925f`). **perslfc `23a2ef44` was never registered on mainnet and the mainnet register script's default observer list omits perslfc — pass `--observers perspz,persdsg,perslfc` explicitly.** Idempotency fix (registered vs active) landed in both register scripts.
6. **pz_settings multisig update** (2-of-4): append `e30bd311/1fcfe6fd/a700056e` to valid_contracts + `1fcfe6fd` to persdsg_hashes; ALSO remove the never-deployed `7c99516a` dead entry (present on mainnet + preprod).

**Trigger-day riders + funding:**
- `kora@handle_prices` 990→995 ADA (basic tier) rides the settings tx — matches preprod; get explicit approval that the price change is intended at cutover time.
- handlecontract `addr1x8gyj64…` has only ~77 ADA across 3 pure-ADA UTxOs — tx-01 consumes all of them; **fund the handlecontract address before staging demimnt's redeploy + the settings tx** (planner reported "UTxO Balance Insufficient" for those two).
- Admin wallet `addr1v9x6jedq…` holds 39.3 ADA — sufficient for the MPT migration (≥10 ADA, no prep tx).
- Box fn config at cutover: deploy-box.yml now carries `KORA_FN_TIMEOUT_SECONDS=120` (fixes mainnet's 30s bff timeout on promote); rebuild `kora-mainnet-chat` + `kora-mainnet-marketplace` (still on the old branch-literal VERSION_HASH scheme).
- Verify env on both boxes post-deploy: JWT_PRIVATE_KEY/JWT_PUBLIC_KEY, NFTCDN_GATEWAY_KEY (absent → image-recovery tier silently no-ops), BLOCKFROST key.
- Refresh `handles-personalization/deploy/mainnet/*.unoptimized.cbor` to the HEAD verbose builds as part of the pers redeploy (mainnet's served perspz unopt is stale vs even the currently-deployed 894f24c1).

**Already fixed live (this audit, not waiting for cutover):** mainnet `assets/f31de97e…/images` 404s (fn/static fingerprint drift — images restored byte-identical on both boxes; smoke suite 6-pass/1-skip green); GH `mainnet` environment now restricted to the mainnet branch.
