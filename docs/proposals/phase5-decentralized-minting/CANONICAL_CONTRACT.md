# decentralized-minting canonical contract

**Status: DRAFT proposal (ecosystem-ownership-plan Phase 5, row 5.2). NOT ACTIVE.** Re-drafted 2026-10-28 from the closed proposal #58. It lives under `docs/proposals/phase5-decentralized-minting/`, where `merge_pr` does not read it. The operator adopts it by moving this file and `.enclave` to the repo root in a separate change; paths below are repo-root-relative. Operator review of what must never be violated is pending.

These contracts decide which handles can exist. The minting-data UTxO holds the single MPT root of
every minted handle; the root is what makes a double-mint impossible on chain. Protected
production source is listed in [`.enclave`](./.enclave). Other enforcement references below
are not automatically protected paths; review scope and execution authority are separate.

## Review scope and unchanged authority

Decision 2 clarification (2026-10-13): the human-review enclave is actual Aiken/Helios
on-chain source, listed as exact files in [`.enclave`](./.enclave), plus this contract
and the manifest's self-protection. Test-only sources, npm/package files, JS/TS,
builders, configuration, generated artifacts and workflows follow ordinary automated
tests and independent agent review; their location in a contract repository alone
never requires human approval. Existing unrelated holds remain in force.

Separately identifiable embedded Aiken `test` blocks and test-only helpers are testing
code, not protected on-chain behavior. Test-only edits to those blocks follow ordinary
agent review. Mixed files remain listed for their production definitions: the current
path-only merge gate cannot distinguish such hunks and may still request approval.
This is an enforcement limitation, not expanded human-review policy; no source was
split or changed in this documentation-only proposal.

This narrows code-review scope only. Actual on-chain validator or settings changes
(settings handles, policy roots, `pers*@handle_settings` and handlecontract datums),
anything that could double-mint, and automated burns or other irreversible on-chain
actions retain explicit operator authorization. Routine builder/package/test repairs
are not such actions merely because of their repository or filename. K.O.R.A. may
sign for preview only within existing authorization; preprod and mainnet always need
humans on the multisig. No signing, secret access or spending is authorized here.
Independent review pending; this proposal is not accepted and must not be merged.

## Source requirements

- Ecosystem `AGENTS.md` (koralabs root), "Critical Correctness": handle addresses correct 100% of
  the time, never double-mint, properties chain-accurate. "Merging": any edit to an on-chain
  contract/validator or to contract settings (settings handles, policy roots, `pers*@handle_settings`
  datums, handlecontract datums), anything that could double-mint, and any automated burn is
  higher-risk and needs operator approval before merge.
- kora-bot `v3/docs/ecosystem-ownership-plan.md` §6 decision 2: for contract repos the enclave holds
  Aiken/Helios on-chain source, excluding testing and npm/package code; K.O.R.A. may sign for preview only,
  preprod and mainnet always need humans on the multisig. Phase 5 row 5.2.
- kora-bot `v3/docs/tool-surface.md` (`merge_pr`): cards enclave paths merged into
  `master`/`main`/`mainnet`/`preprod`, reading a root `.enclave`.
- This repo: `AGENTS.md` "DESIGN LAW" (MPT is API-sourced, never disk-cached);
  [`docs/spec/contract-protections.md`](./docs/spec/contract-protections.md) (per-validator
  protections, the test checklist).

## Must never be violated

1. **Never double-mint.** A handle key enters the MPT root at most once; a mint under the DeMi
   policy is valid only if `demimntmpt` spends the minting-data UTxO and `tx.mint` exactly equals
   the proofs (`demimntprx` → `demimnt` → `demimntmpt`).
2. **The policy id and proxy hash are frozen.** `demimntprx` never changes; logic moves only by
   swapping governors in settings.
3. **The MPT root changes only inside a mint/burn tx**, or the admin-signed, mint-nothing
   `UpdateMPT` the operator runs by hand. Never an automated root sync. The off-chain trie is
   rebuilt from the API every time and checked against the on-chain root; no disk cache, no fallback.
4. **Orders pay out to their owner.** `demiord` consumes an order only when a mint happens; a
   refund pays at least the order's lovelace to the owner's credential; cancel needs the owner.
5. **Reference tokens go to the personalization address** (`settings_v1.pz_script_address`), user
   tokens to the order destination, fees as priced.
6. **Signing:** K.O.R.A. may sign preview deployments only. Preprod and mainnet settings, script and
   root changes always need humans on the multisig. No automated burns.

## Where it is enforced today

| # | Code |
|---|---|
| 1, 3 | `smart-contract/validators/demimntmpt.ak`, `lib/validations/minting_data/`, `src/store/` + `tests/store.unit.test.ts` |
| 2 | `smart-contract-mint-proxy/validators/demimntprx.ak` |
| 4 | `smart-contract/validators/demiord.ak`, `lib/validations/orders/` |
| 5 | `lib/validations/mint_v1/`, `lib/decentralized_minting/settings_v1.ak` |
| 6 | `deploy/<network>/`, `src/deploymentPlan.ts`, `src/deploymentTx.ts`, `.github/workflows/deployment-plan.yml` |

## Refactor needed for enforcement

- **Planned protections are not enforced yet** (`contract-protections.md` WS1 #2-#5: label-burn
  policy, empty-registry guard on key delete, orphan path). Until they land, their "must never be
  possible" tests are missing.
- **Rule 6 is prose only.** Nothing in the deploy plan refuses a non-preview signature by K.O.R.A.;
  it relies on the multisig. The deployment runbook (plan row 4.7) should make that a check.
- **`scripts/` can build and sign txs** but is not enclaved (run by hand); the builders it calls also follow ordinary agent review; execution authority is separate.
