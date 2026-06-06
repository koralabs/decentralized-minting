# Task State

## Run Metadata

- run_id: `demi-subhandle-burn-unattended-2026-06-05`
- prompt_file: `tasks/UNATTENDED_PROMPT.md`  (this run's prompt — follow it each iteration)
- backlog_file: `tasks/TODO.md`
- working_repo_primary: `decentralized-minting` (tasks name their own repo; multi-repo run)
- current_task_id: `DSH-401`
- next_task_id: `DSH-403` (needs 401+402; 402 done, 401 in progress)
- total_tasks: `26`
- completed_tasks: `11`
- blocked_tasks: `1`
- overall_status: `ready`
- last_updated_utc: `2026-06-06T01:40:00Z`
- milestone: `decentralized-minting contract COMPLETE (Phases 0-2: DeMi subhandle mint + free-virtual + DeMi burn). Next phase = personalization $handle_policies awareness + burn (different repo, newer aiken toolchain).`
- driver: `synchronous` (in-session; autonomous cron/wakeup did not fire in this environment)

## Concurrency guard (no double-work)

- Iterations are **serial**: each loop iteration first reads this file, picks the single
  next `pending` task whose deps are all `done`, sets `current_task_id` + status `in_progress`
  + `Started UTC`, then implements it. Never start a task already `in_progress` or `done`.
- If an iteration finds a task `in_progress` with a `Started UTC` but no matching open work
  (stale, e.g. a crashed iteration), verify against git/test state: if its commit landed,
  mark it `done`; otherwise reset it to `pending` and restart cleanly. Do this BEFORE picking
  a new task.
- Only one task is `in_progress` at any time.

## Status Legend

- `pending` · `in_progress` · `blocked` · `done`

## Phase Coverage

- `PHASE-0-DONE`: `DSH-001`, `DSH-002`, `DSH-003`, `DSH-004`
- `PHASE-1-FREEVIRTUAL`: `DSH-101`, `DSH-102`, `DSH-103`
- `PHASE-2-DEMI-BURN`: `DSH-201`, `DSH-202`, `DSH-203`
- `PHASE-3-PZ-POLICY-BURN`: `DSH-300` (prereq), `DSH-301`, `DSH-302`, `DSH-303`
- `PHASE-4-PACKAGE`: `DSH-401`..`DSH-406`
- `PHASE-5-SERVICES`: `DSH-501`, `DSH-502`, `DSH-503`
- `PHASE-6-DEPLOY`: `DSH-601`, `DSH-602`, `DSH-603`

## Gap Coverage

- No `docs/spec/gaps.md` in this repo; `tasks/TODO.md` is the coverage map.

## Tasks

| id | status | deps | repo | started_utc | finished_utc | commit | notes |
|----|--------|------|------|-------------|--------------|--------|-------|
| DSH-001 | done | — | decentralized-minting | — | 2026-06-05 | 91b204c | legacy path stripped; 167 checks |
| DSH-002 | done | — | decentralized-minting | — | 2026-06-05 | (pre-existing) | orders already DeMi-only (Execute/Cancel/Refund) |
| DSH-003 | done | — | decentralized-minting | — | 2026-06-05 | 2a379d2 | subhandle minting on orders path; fee folding A |
| DSH-004 | done | DSH-003 | decentralized-minting | — | 2026-06-05 | 97a36ba | owner-fee double-satisfaction tests; 173 checks |
| DSH-101 | done | DSH-003 | decentralized-minting | 2026-06-06T00:05:00Z | 2026-06-06T00:12:00Z | f31fdd5 | registry_value→name-set + label-path ripple; 167 checks. (LabelAssetProof ripple absorbed here to stay green) |
| DSH-102 | done | DSH-101 | decentralized-minting | 2026-06-06T00:12:00Z | 2026-06-06T00:20:00Z | b0c117e | OrderProof + free-virtual mint branch; MintNewHandles ABI changed; 167 checks |
| DSH-103 | done | DSH-102 | decentralized-minting | 2026-06-06T00:20:00Z | 2026-06-06T00:25:00Z | 4ad4e1e | free-virtual value-transition tests; e2e deferred to DSH-401; 169 checks |
| DSH-201 | done | DSH-003 | decentralized-minting | 2026-06-06T00:25:00Z | 2026-06-06T00:30:00Z | c8fa9f9 | governor can_burn_handles enabled (mirror of mint); 169 checks |
| DSH-202 | done | DSH-102, DSH-201 | decentralized-minting | 2026-06-06T00:30:00Z | 2026-06-06T00:38:00Z | 35a8563 | BurnNewHandles redeemer (idx 5) + can_burn_new_handles + all_burn_proofs_are_valid; 169 checks |
| DSH-203 | done | DSH-202 | decentralized-minting | 2026-06-06T00:38:00Z | 2026-06-06T00:40:00Z | afbf136 | burn=inverse-of-mint roundtrip; e2e→DSH-402; 170 checks |
| DSH-300 | blocked | — | handles-personalization | 2026-06-06T01:30:00Z | — | — | PREREQ: verify pz baseline green with aiken v1.1.21 (its aiken.toml compiler; binary already on PATH at ~/.cargo/bin/aiken). BLOCKED: baseline is RED — 124 pass / **1 pre-existing fail** `dispatch_from_tx_update_branch_accepts_private_root_address_change` (Update/private-root-address-change, unrelated to burn/policy). Must be resolved (fixed or confirmed known) before building pz features. → USER_ACTIONS |
| DSH-301 | pending | DSH-300 | handles-personalization | — | — | — | pz $handle_policies reader + membership check + nft/root burn redeemer (release 100 iff matching 222 burned, policy ∈ $handle_policies). Investigated 2026-06-06: pz hardcodes f0ff48bb; uses newer aiken (cardano/ stdlib); reader mirrors load_policy_index_root |
| DSH-302 | pending | DSH-301 | handles-personalization | — | — | — | pz burn tests |
| DSH-303 | pending | DSH-301 | handles-personalization | — | — | — | make pz personalize/migrate/revoke/ownership $handle_policies-aware (reuse DSH-301 reader; replace hardcoded f0ff48bb) so DeMi handles get FULL pz support (parity) |
| DSH-401 | in_progress | DSH-102, DSH-202 | decentralized-minting pkg | 2026-06-06T01:45:00Z | — | — | proof/redeemer ABI: OrderProof/FreeVirtualData/BurnProof encoders, MintNewHandles(List<OrderProof>)+BurnNewHandles, LabelAssetProof old_free_names. Contract ABI read from validators/demimntmpt.ak + minting_data/types.ak |
| DSH-402 | done | DSH-101 | decentralized-minting pkg | 2026-06-06T01:36:47Z | 2026-06-06T01:40:00Z | 82b972c | CRITICAL byte-parity. `src/store/registryValue.ts` ports registry_value.ak (encode + hasFreeSlot/hasFreeName/addFreeName/removeFreeName); `tests/registryValue.test.ts` 10 tests w/ pinned bytes. serialise_data(List<ByteArray>) CBOR confirmed vs aiken v1.0.29 (non-empty 9f..ff, bytestr 0x40\|len(<24) or 58 len(24-64), empty 80, throw>64). Old count-based encodeRegistryValue in labelSet.ts marked @deprecated; its legacy-builder callers migrate in DSH-401/403. vitest 64 pass, tsc+eslint clean |
| DSH-403 | pending | DSH-401, DSH-402 | decentralized-minting pkg | — | — | — | mint build relocation to orders/MintNewHandles + free-virtual proofs + trie maintenance |
| DSH-404 | pending | DSH-401, DSH-402, DSH-301 | decentralized-minting pkg | — | — | — | burn build: BurnNewHandles + coordinated burn tx (governor+demimntmpt+pz) + trie delete/free-name removal |
| DSH-405 | pending | DSH-403, DSH-404 | decentralized-minting pkg | — | — | — | e2e tests with a real Trie (free-virtual mint/burn, nft/virtual burn) — deferred from DSH-103/203 |
| DSH-406 | pending | DSH-401, DSH-202 | decentralized-minting pkg | — | — | — | regenerate blueprints (new demimntmpt/demimnt hashes) + pinned-hash test + deploy config |
| DSH-501 | pending | DSH-403 | minting.handle.me | — | — | — | engine mint: additive fee outputs on orders path (folded) + free-virtual tx metadata + settings reads |
| DSH-502 | pending | DSH-404, DSH-501 | minting.handle.me | — | — | — | engine burn: coordinated DeMi burn tx end-to-end |
| DSH-503 | pending | DSH-303, DSH-401 | handle.me/bff | — | — | — | bff: attach $handle_policies ref input to ALL pz txs; buy_down gone; fee display |
| DSH-601 | pending | DSH-302, DSH-303 | handles-personalization + api | — | — | — | deploy new pz contract version; register persprx hash in api script registry |
| DSH-602 | pending | DSH-406, DSH-502, DSH-503, DSH-601 | decentralized-minting + adahandle-deployments | — | — | — | deploy DeMi: bundle + publish pkg + engine. **USER multisig sign (reserved for end)** → USER_ACTIONS |
| DSH-603 | pending | DSH-602 | preview | — | — | — | on-chain verification (mint nft/virtual, owner-fee, 3 free, reopen-on-burn, nft burn 222-check, virtual Revoke, MPT delete) |

## Run Log

- 2026-06-05T23:53:31Z — Task system created from `docs/product/demi-subhandle-minting.md` roadmap. DSH-001..004 recorded as done (committed earlier this session). Queue `ready`; next `DSH-101`.
- 2026-06-06T00:05–00:40Z — Autonomous cron/wakeup did not fire in this environment; hand-drove synchronously. Completed Phase 1 (DSH-101/102/103 free-virtual name-set) + Phase 2 (DSH-201/202/203 DeMi burn path). **decentralized-minting contract is COMPLETE: 170 aiken checks, 0 warnings.**
- 2026-06-06T01:00Z — Investigated DSH-301 (pz burn). Finding: pz hardcodes `f0ff48bb`; for DeMi (`6c32db33`) parity the pz contract must validate policy against `$handle_policies` (decentralized registry), per user. Restructured Phase 3 → reader+burn (DSH-301) + broader `$handle_policies`-awareness (DSH-303). User confirmed old-token migration is already built (not a blocker). pz uses a newer aiken toolchain (cardano/ stdlib) than this repo's pinned v1.0.29 — set up before building. **Milestone checkpoint: contract phase done; pz phase is the next, fresh, larger body of work.**
- 2026-06-06T01:40Z — DSH-402 done (registry_value off-chain byte-parity). Verified `builtin.serialise_data(List<ByteArray>)` CBOR empirically with aiken **v1.0.29-alpha** (`~/.aiken/versions/v1.0.29-alpha/aiken-x86_64-unknown-linux-gnu/aiken`) — the repo's pinned compiler; the PATH binary (v1.1.21, `~/.cargo/bin/aiken`) **cannot load this project** (rejects `plutus = "v2"`, "only supports Plutus V3"). **TOOLCHAIN NOTE for DSH-401/403/406 (contract-touching):** use the v1.0.29 binary for `aiken check`/`fmt`. Also found the committed `.ak` files do NOT pass `aiken fmt --check` under v1.0.29 (5 files have signature/call line-wrap drift, likely formatted by a newer aiken) — pre-existing, left untouched (out of scope for this TS-only task); a contract task should run `aiken fmt` once with v1.0.29 to normalize before regenerating blueprints (DSH-406).
- 2026-06-06T01:20Z — Audited the task list for completeness (user asked "is it spec'd enough to drive to completion?"). Found real gaps: the cascade was too coarse and missing (a) registry_value off-chain byte-replication [now DSH-402, CRITICAL], (b) explicit proof/redeemer ABI encoders [DSH-401], (c) package e2e with a real Trie [DSH-405], (d) the pz `$handle_policies` ref-input ripple onto ALL existing pz txs [DSH-503], (e) the pz contract deploy as its own step [DSH-601], (f) preprod/mainnet propagation note (mainnet = explicit user auth). Restructured: PHASE-4-PACKAGE (DSH-401..406), PHASE-5-SERVICES (501-503), PHASE-6-DEPLOY (601-603). 25 tasks total; multisig signing isolated to DSH-602 (reserved for the end).
