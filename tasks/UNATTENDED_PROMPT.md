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

## CRITICAL CONTEXT — read this and the spec doc BEFORE touching anything

These points were established (and several were hard-won corrections) in the session that built the
contract. The full detail is in the spec doc
(`/home/jesse/src/koralabs/decentralized-minting/docs/product/demi-subhandle-minting.md`) — **read
it first.** Do not re-derive or second-guess these; they are settled:

**The point (frames every decision).** DeMi = *decentralized* parity with legacy minting, deployed
preview→preprod→mainnet. Decentralization is the whole point: validate against on-chain registries
(e.g. `$handle_policies`), never hardcode. "It's governed on-chain, not by a held key" is why DeMi
exists.

**Architecture (these were corrected the hard way — do not revert to the wrong version):**
- DeMi handles (roots + subhandles) mint under the **DeMi policy `6c32db33`**, NOT the legacy
  native policy `f0ff48bb`.
- **Two independent mint paths, SEPARATE enforcement, SHARED pure helpers.** The legacy path
  (`MintLegacyHandles`) mints as it does on mainnet today — uniqueness (MPT) + correct 222/100/000
  tokens, and enforces **nothing new** (no fees, no free-virtual, no discounts). All of that is
  **DeMi-path-only** (the orders path). Do NOT add fee/allowance/discount logic to the legacy path.
  Rejected alternative: "shared path, legacy passes zeros" — it burns ex-units on the high-volume
  legacy path and re-couples the very thing that caused the original mistake.
- Orders (`demiord`) are **DeMi-only**. Legacy never uses orders.

**Fee model (additive three-fee; "owner fee", NEVER "royalty" — royalty=CIP-27, different thing):**
- A paid subhandle buyer pays **owner fee + minter fee + treasury fee**, all additive. Owner fee
  may be 0; minter + treasury are FLAT amounts from settings (today minter = 2 ADA, treasury = 0).
- Destinations: owner fee → the owner's `payment_address`; minter fee → an **allowed minter**
  (Kora Labs), NEVER the treasury; treasury fee → `treasury_address`.
- **Design A folding:** subs' flat minter/treasury fold into the batch minter/treasury outputs (one
  each for the whole mixed batch); owner fees are separate per-owner outputs; roots keep their
  percentage split. The 2-ADA treasury floor applies only when the batch has root handles.
- **Double-satisfaction defenses (keep them):** token outputs consumed POSITIONALLY (each used
  once, never `list.any`); owner fees MERGED per credential; owner-fee check scans only the
  LEFTOVER outputs (after the fixed fee/token outputs).

**Free-virtual:** track the ≤3 free **NAMES** (not a counter) in the root key's MPT value; a free
mint adds the name, a free burn removes it → reopens the slot; public virtuals never consume the
allowance. **CRITICAL:** the off-chain `registry_value` encoding (`encode(free_names, labels)`)
must be **byte-identical** to the contract (`DSH-402`), or every free-virtual `mpt.update` fails
on-chain. Also mirror it to tx metadata (chain-as-source-of-truth).

**Burn = the exact mirror of mint:** `mpt.delete` proves the key was present (existence-before),
yields absence-after; the tx burns −1 of the tokens. Authorization lives WHERE THE TOKENS ARE — the
holder provides the 222/000 as burned inputs (you can only burn what you hold), the pz contract
releases its held 100/000; the DeMi `BurnNewHandles` redeemer just keeps the MPT in sync. **NFT/root
burn:** pz releases the `100` iff the matching `222` is also burned (= owner consent). **Virtual
burn:** pz `Revoke` already exists (private → root-signed; public → lease-expired) — don't change it.

**Personalization must become `$handle_policies`-aware.** pz today hardcodes `f0ff48bb`. Since DeMi
is `6c32db33`, pz must validate a handle's policy against the on-chain **`$handle_policies`**
registry (the decentralized fix) — for the new burn AND the rest of pz (personalize/migrate/revoke),
or DeMi handles can't be personalized at all (not just unburnable). Old tokens at prior pz contracts
are **NOT a blocker** — migration is already built (contract + frontend); the `$handle_policies` ref
input must then be attached to EVERY pz tx (`DSH-503`) or existing flows break. **The pz baseline is
RED right now** (`DSH-300`, a pre-existing failing test) — confirm/fix before building on it.

**Hard rules (company-killers — never violate):** NEVER mint Kora handles outside the production
minting service. NEVER touch mainnet without explicit per-deploy user authorization (this run is
**preview only**). Fix EVERY ts/lint/test failure on every change — no "pre-existing" excuses. The
BFF uses `@cardano-sdk` only — never Helios/MeshJS/CSL/CML. Reproduce + verify failures with the
scalus evaluator before any deploy.

**Failure mode to avoid (mine, this session):** I over-scoped — treating each discovery as a "should
we do this big thing?" question — and I built a large piece on a WRONG assumption (DeMi subs under
the legacy policy) before surfacing it. When a discovery seems to reframe scope, check it against
*the point* and the committed spec doc, and verify on-chain reality against a real example, rather
than guessing or ballooning. The contract is already DONE and green (Phases 0–2); trust the
committed state and the spec doc.

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
