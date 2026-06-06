You are running an unattended execution session for the **DeMi SubHandle Minting + Burn** work.

## Absolute paths (use these exactly — do NOT use relative paths)

The task system lives in ONE place regardless of your shell's current directory:

- TODO list:        `/home/jesse/src/koralabs/decentralized-minting/tasks/TODO.md`
- Task state (SoT): `/home/jesse/src/koralabs/decentralized-minting/tasks/TASK_STATE.md`
- User actions:     `/home/jesse/src/koralabs/decentralized-minting/tasks/USER_ACTIONS_CHECKLIST.md`
- This prompt:      `/home/jesse/src/koralabs/decentralized-minting/tasks/UNATTENDED_PROMPT.md`
- Spec/roadmap:     `/home/jesse/src/koralabs/decentralized-minting/docs/product/demi-subhandle-minting.md`

> This is a **MULTI-REPO** run. The task system above is the single control plane, but each task
> names its OWN repo (`decentralized-minting`, `handles-personalization`, `minting.handle.me`,
> `handle.me/bff`, `adahandle-deployments`). Do the work in that task's repo, run that repo's
> tests/build, update THAT repo's docs, and commit to THAT repo. There is no `docs/spec/gaps.md`;
> `TASK_STATE.md` + `TODO.md` are the authoritative coverage map.

## Objective

- Complete all dependency-ready `pending` tasks in the TODO/TASK_STATE above, driving DeMi to
  decentralized parity with legacy (subhandle mint + free-virtual + burn, governed on-chain),
  deployable to preview.
- `TASK_STATE.md` is the source of truth for whether work remains. Your own sense that you reached
  a "good checkpoint" is NOT authoritative.

## Execution loop (repeat until done)

1. Read `TASK_STATE.md`, `TODO.md`, this prompt (absolute paths above).
2. **Concurrency guard:** if any task is `in_progress`, reconcile it against git/test state FIRST —
   if its commit landed mark it `done`, else reset it to `pending`. Never start an `in_progress`
   or `done` task. Only ONE task is `in_progress` at a time.
3. Select the next `pending` task whose dependencies are all `done`. (Independent chains run in
   parallel — e.g. the package chain doesn't wait on a blocked pz task; pick any dependency-ready
   one.)
4. In `TASK_STATE.md`: set `current_task_id`, status `in_progress`, `started_utc`; commit that
   state change immediately to claim the task.
5. Implement it in the task's repo (minimal, clean — KISS/YAGNI). Add/update unit + e2e tests.
6. Run tests (targeted first, then broader). Keep the touched repo green.
7. Update that repo's docs when relevant.
8. Mark the task `done` in BOTH `TODO.md` (check the box) and `TASK_STATE.md` (`finished_utc`,
   commit hash, notes); update counters (`completed_tasks`, `blocked_tasks`, `next_task_id`).
9. Commit with `feat(<task-id>): <short description>` to the task's repo.
10. Continue immediately to the next dependency-ready task — do not wait for confirmation.

## Blocker policy

- If blocked by a user-only action (credentials, signing, an external account/decision, or a
  "is this known?" judgment): mark the task `blocked` in `TASK_STATE.md` with the exact blocker
  text, leave it unchecked in `TODO.md`, append the requirement to `USER_ACTIONS_CHECKLIST.md`,
  and **continue with the next unblocked dependency-ready task** (do not stop the whole run).
- Stop only when every task is `done` or `blocked`.

## Final-answer guard

- Before any final answer, re-read `TASK_STATE.md`. If any task is `pending` with all deps `done`,
  do NOT stop — start it.
- A final answer is valid only when there are no dependency-ready `pending` tasks left. When you
  stop, the first lines must be `Stop reason: <reason>` and `Why this is not a loop violation:
  <cite the exact TASK_STATE condition>` (e.g. all remaining tasks blocked, or a hard tool failure).

## Invalid stop conditions

- Do not stop because you reached a checkpoint, made commits, finished a phase, or have enough for
  a status update. Do not stop while at least one dependency-ready `pending` task can start.

## Known gates (already recorded — work around them, don't stall)

- `DSH-300` (pz baseline) is `blocked` on a USER_ACTIONS question (a pre-existing pz test failure).
  The pz chain (`DSH-300`→`301`→`302`→`303`) waits on it; the package/engine chain does not.
- All user signatures are isolated to the deploy phase (`DSH-601`/`DSH-602`).

## Guardrails

- Follow `AGENTS.md` (root + each repo's local). Keep IMPORTANT/all-caps comments. Maintain
  API/type integrity. NEVER touch mainnet (preview only; mainnet needs explicit per-deploy user
  auth). NEVER mint outside the production minting service.
