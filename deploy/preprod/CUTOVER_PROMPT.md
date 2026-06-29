# DeMi preprod cutover — new-session driver prompt

Paste this into a fresh session, or `@`-reference this file. It is self-contained.

---

## Mission

Drive the **DeMi (decentralized minting) preprod cutover** to done: the DeMi
contracts + minting engine + BFF live on preprod, and the live-cip30 suite
proves the DeMi mint paths on-chain on preprod.

**This is the FIRST time the preprod cutover is driven on the self-hosted box
instead of AWS.** Expect divergences from every AWS-era assumption. Surprises
are the point of this run, not interruptions — document each one (see
"Primary ongoing deliverable").

## Read first (in order)

1. `decentralized-minting/deploy/preprod/CUTOVER.md` — **THE runbook**: preprod
   params, the cutover sequence, the 6 findings from the preview 23/23, and the
   "Box cutover log" you will append to.
2. `decentralized-minting/docs/product/legacy-parity-plan.md` — DeMi design
   source-of-truth.
3. `decentralized-minting/docs/MANUAL-DEPLOY-RUNBOOK.md` — manual contract
   deploy (local planner → multisig; the GH workflow is out of date).
4. `decentralized-minting/tmp/demi-deploy-v122/CUTOVER.md` — the **preview**
   deploy, tx-by-tx; your preprod deploy txs mirror this shape.
5. Memory `MEMORY.md` index — load esp. `feedback_never_mint`,
   `feedback_no_unauthorized_mainnet`, `feedback_syncmintingdataroot_operator_only`,
   `feedback_mpt_calculate_independently_first`, `feedback_preview_not_on_aws`,
   `reference_demi_contract_deploy_process`, `reference_demi_mint_preflight_requirements`,
   `reference_handlecontract_terminology`, `reference_demimntmpt_traced_eval_and_burn_abi`,
   `project_live_cip30_fullsuite_status`.

## The box-vs-AWS reality (verified 2026-06-29 — your starting map)

- `kora-preprod` fn app **EXISTS on the box** (`ssh kora-sf 'fn list apps'`),
  next to `kora-preview` and `kora-mainnet`. preprod is provisioned on the box.
- `handle.me/.github/workflows/deploy-box.yml` is **preview-only**: `on: push:
  [preview]`, `NETWORK: PREVIEW`, `kora-preview-*` fns, `preview.*` domains.
  There is **no preprod box-deploy yet**, and the AWS `deploy.yml` still
  triggers on preprod push. **Hurdle #1: establish the preprod box-deploy.**
  Per deploy-box.yml's own header — "AT CUTOVER add `push: [preprod]` here AND
  drop preprod from deploy.yml." Decide with the user: parameterize
  deploy-box.yml for preprod, or deploy preprod fns manually via the
  adahandle-deployments common scripts with `NETWORK=PREPROD`.
- **DNS**: confirm `preprod.handle.me` / `.bff.` / `.auth.` resolve to the box
  vs still AWS. A box deploy is inert until DNS points at the box. Cutting DNS
  is irreversible-ish and user-visible — confirm with the user before flipping.
- The box fn-timeout mechanism `KORA_FN_TIMEOUT_SECONDS=120` applies on the box,
  same as preview — NOT the Lambda timeout (CUTOVER.md Finding 3, revised).
- minting.handle.me preprod branch DeMi pkg is stale (`2.0.3`); the preview
  branch carries `3.0.2` + the sub-mint fix `236c7a1`. Merge forward.

## The pieces (all must land together — see CUTOVER.md)

1. **Contracts** (`deploy/preprod/*.unoptimized.cbor` + `decentralized-minting.yaml`):
   demimntprx / demimntmpt / demimnt / demiord — MANUAL deploy, multisig-signed.
   Re-derive hashes first; the preprod demimntmpt must be `4ae33c5f…`.
2. **Settings**: `demi@handle_settings`, `handle_root@handle_settings`,
   `kora@handle_prices` (multisig).
3. **Engine** (minting.handle.me preprod): version-locked DeMi `3.0.2` + the
   222→`destination_address` fix (CUTOVER.md Findings 1+2). Deploy to the box.
4. **BFF** (handle.me preprod): on the box; request timeout ≥120s (Finding 3).
5. **Governor wallet**: funded + stake-registered + ≥13 ADA collateral (Finding 5).

## Definition of done

live-cip30 against preprod, the DeMi scopes green **on-chain with evidence**:
**02** (DeMi root), **19** (configure DeMi root sub settings), **20** (DeMi NFT
sub), **21** (DeMi virtual sub), **22** (28-char). Ideally a full unbroken
**00→22**. Each scope = on-chain tx + user-visible UX success element + trimmed
video + screenshot. Methodology: **fix-and-advance**, resume via
`E2E_START_SCOPE=<N>`, never restart from 00; one clean full run only at the end.

## PRIMARY ONGOING DELIVERABLE — document everything

Every divergence, box-vs-AWS difference, surprise, and fix → append to
**`decentralized-minting/deploy/preprod/CUTOVER.md` → "Box cutover log — issues
hit + mainnet-prep notes" → Run log**, dated, as you go. `kora-mainnet` is also
a box app and there is no mainnet cutover doc yet — **this log becomes the seed
for the mainnet cutover.** This is the explicit reason the run is attended;
treat it as a deliverable equal to the cutover itself.

## Boundaries (hard)

- **NEVER mint Kora handles outside `minting.handle.me`** (`feedback_never_mint`).
- This **preprod** cutover is authorized (the user initiated it). **Mainnet is
  NOT** — never push/propagate to mainnet without explicit per-deploy auth
  (`feedback_no_unauthorized_mainnet`). `kora-mainnet` exists on the box; do not
  touch it.
- **NEVER run `syncMintingDataRoot`** to "fix" an apparent MPT drift — calculate
  the root independently first (`feedback_mpt_calculate_independently_first`,
  `feedback_syncmintingdataroot_operator_only`).
- Contract + settings txs are **multisig** — you BUILD unsigned txs; the user
  (+ co-signers) sign + submit. Do not freelance signing.
- Confirm with the user before irreversible/user-visible infra steps (DNS flip,
  dropping preprod from deploy.yml). The user is driving this run and is present.

## Working notes

- Need a value (key, address, hash)? `grep -ra <thing> ~/.claude/projects/*/*.jsonl`.
- Debug a failing DeMi tx with `aiken tx simulate --script-override`, NOT scalus
  (CUTOVER.md Finding 4).
- The preview DeMi work (live-cip30 23/23, 2026-06-29) is the reference: txs in
  `decentralized-minting/deploy/preview/`, run history in handle.me
  `tasks/DEMI_VERIFY_*`.
- live-cip30 runs from `handle.me/static`:
  `./scripts/switch-env.sh preprod` then
  `xvfb-run -a npx playwright test browser-tests/live-cip30.spec.ts --project=live-cip30`.
