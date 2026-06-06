# Task State

## Run Metadata

- run_id: `demi-subhandle-burn-unattended-2026-06-05`
- prompt_file: `tasks/UNATTENDED_PROMPT.md`  (this run's prompt — follow it each iteration)
- backlog_file: `tasks/TODO.md`
- working_repo_primary: `decentralized-minting` (tasks name their own repo; multi-repo run)
- current_task_id: `DSH-301`
- next_task_id: `DSH-302`
- total_tasks: `18`
- completed_tasks: `10`
- blocked_tasks: `0`
- overall_status: `in_progress`
- last_updated_utc: `2026-06-06T00:40:00Z`
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
- `PHASE-3-PZ-BURN`: `DSH-301`, `DSH-302`
- `PHASE-4-CASCADE`: `DSH-401`, `DSH-402`, `DSH-403`, `DSH-501`, `DSH-502`, `DSH-503`
- `PHASE-5-DEPLOY`: `DSH-601`, `DSH-602`

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
| DSH-301 | in_progress | — | handles-personalization | 2026-06-06T00:40:00Z | — | — | nft/root burn redeemer (release 100 iff 222 burned) |
| DSH-302 | pending | DSH-301 | handles-personalization | — | — | — | pz burn tests |
| DSH-401 | pending | DSH-102 | decentralized-minting | — | — | — | pkg: subhandle build legacy→orders + free-virtual proofs |
| DSH-402 | pending | DSH-202, DSH-301 | decentralized-minting | — | — | — | pkg: burn tx builders |
| DSH-403 | pending | DSH-102, DSH-202 | decentralized-minting | — | — | — | pkg: regenerate blueprints + pinned hashes + config |
| DSH-501 | pending | DSH-401 | minting.handle.me | — | — | — | engine: fee outputs on orders path + tx metadata |
| DSH-502 | pending | DSH-402, DSH-501 | minting.handle.me | — | — | — | engine: burn txs |
| DSH-503 | pending | DSH-401 | handle.me/bff | — | — | — | bff: buy_down gone + fee display |
| DSH-601 | pending | DSH-403, DSH-302, DSH-502, DSH-503 | decentralized-minting + adahandle-deployments | — | — | — | deploy; **needs user multisig + admin sign** → USER_ACTIONS |
| DSH-602 | pending | DSH-601 | preview | — | — | — | on-chain verification |

## Run Log

- 2026-06-05T23:53:31Z — Task system created from `docs/product/demi-subhandle-minting.md` roadmap. DSH-001..004 recorded as done (committed earlier this session). Queue `ready`; next `DSH-101`.
