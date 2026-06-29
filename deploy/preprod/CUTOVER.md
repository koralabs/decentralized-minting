# DeMi (decentralized minting) — PREPROD cutover plan

Status: **NOT STARTED.** Contracts compiled + params staged in this
directory (`deploy/preprod/`); nothing submitted on preprod yet. Preview
reached a clean live-cip30 **23/23** (scopes 00→22, incl. the DeMi scopes
02/19/20/21/22) on 2026-06-29.

- Design source-of-truth: [`../../docs/product/legacy-parity-plan.md`](../../docs/product/legacy-parity-plan.md)
- Deploy mechanics (MANUAL — the GH workflow is out of date): [`../../docs/MANUAL-DEPLOY-RUNBOOK.md`](../../docs/MANUAL-DEPLOY-RUNBOOK.md)
- Preview deploy reference (tx-by-tx pattern): [`../../tmp/demi-deploy-v122/CUTOVER.md`](../../tmp/demi-deploy-v122/CUTOVER.md)
- Preview on-chain verification loop: `handle.me/tasks/DEMI_VERIFY_*`

> This is the DeMi analogue of the (now-removed) V3-personalization preprod
> cutover plan — a **different, already-shipped effort**. DeMi is its own
> stack (its own contracts, engine policy `6c32db33`, governor, orders) and
> deserves its own runbook.

---

## The pieces that must land together

- **Contracts** (this dir's `*.unoptimized.cbor`): `demimntprx` (mint proxy /
  minting policy), `demimntmpt` (minting-data MPT spend validator), `demimnt`
  (governor withdraw), `demiord` (orders spend). Plutus V3, aiken v1.1.22.
  Deploy MANUALLY (local planner → Eternl/multisig) per the runbook; needs
  `HANDLECONTRACT_NATIVE_SCRIPT_CBOR`.
- **Settings handles**: `demi@handle_settings` (the DeMi settings datum),
  `handle_root@handle_settings` (the MPT root), `kora@handle_prices`, plus the
  four script handles (`mint_proxy` / `mint_data` / `mint_v1` / `orders@handle_settings`).
- **Minting engine** (`minting.handle.me`): the DeMi package, version-locked
  to the deployed contract (Finding 2), carrying the sub-mint destination fix
  (Finding 1).
- **BFF + frontend** (`handle.me`): DeMi order/reserve endpoints; the
  live-cip30 suite is the DoD gate (Finding 6).
- **Governor / minting wallet**: funded + stake-registered + collateral
  (Finding 5).

## Preprod parameters (from `decentralized-minting.yaml`)

| Param | Value |
|---|---|
| network | preprod |
| legacy_policy_id | `f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a` |
| admin_vkh | `4da965a049dfd15ed1ee19fba6e2974a0b79fc416dd1796a1f97f5e1` |
| DeMi proxy policy_id | `6c32db33a422e0bc2cb535bb850b5a6e9a9572222056d6ddc9cbc26e` |
| mint_governor | `28db779af4a3ab8114798e907da3703f4e4afd0d01a9818dd68a77fa` |
| allowed_minters | `976ec349c3a14f58959088e13e98f6cd5a1e8f27f6f3160b25e415ca` |
| treasury_address | `addr_test1qz96txepz…syaga0j` (treasury_fee_percentage 10) |
| pz_script_address | `addr_test1wzzctdyf9nkgrzqw6vxhaq8mpla7zhzjyjmk6txyu0wsgrgek9nj3` |
| order_script_hash | `72e4550dfd999d6a18bdbc0105bcb0b0e55691c19592ec02967f51f3` |
| **minting_data_script_hash** (demimntmpt) | `4ae33c5fa06807dcaa9cf3d1ce0adda28745959fb2315d0ace57e334` |
| handle_root mpt_root_hash | `17d278ca48d0d6f8888a628ed734032e984e8fea13da611178d954f259a91b09` |
| kora@handle_prices (current) | `[785_000_000, 445_000_000, 120_000_000, 25_000_000]` |

> **Re-derive before deploy.** `aiken build` (v1.1.22) and confirm
> `getMintingDataSpendValidator(...)` for preprod's network anchor params +
> the `legacy_policy_id`/`admin_vkh` above produces the
> `minting_data_script_hash` (`4ae33c5f…`). A mismatch means wrong params —
> do NOT deploy. (On preview this hash was `efa546e5`; it is network-specific.)

## Cutover sequence

1. **Compile + verify** the four contract hashes against the yaml.
2. **Deploy the 4 contract ref-scripts** via the manual runbook (local
   planner → multisig sign → submit) in the runbook's order. Verify each on
   the preprod api scripts registry.
3. **Publish settings** (multisig): `demi@handle_settings` (governor, policy
   id, treasury, fee %, `pz_script_address`, order + minting-data script
   hashes), `handle_root@handle_settings` root, `kora@handle_prices`.
4. **Deploy the engine** (`minting.handle.me` preprod): version-locked DeMi
   package (Finding 2) + the sub-mint fix (Finding 1). preprod is AWS/Lambda
   (Finding 3) — stagger per `feedback_no_simultaneous_env_pushes`.
5. **Deploy the BFF** (`handle.me` preprod): Lambda request timeout ≥120s
   (Finding 3).
6. **Fund the governor wallet** + register its stake + confirm ≥13 ADA
   collateral (Finding 5).
7. **Verify** with live-cip30 against preprod — scopes **02** (DeMi root
   mint), **19** (configure DeMi root subhandle settings), **20** (DeMi NFT
   sub), **21** (DeMi virtual sub), **22** (28-char). DoD = the suite's
   standard per scope: on-chain tx + user-visible UX success + trimmed video
   + screenshot.

---

## Findings from the preview 23/23 (2026-06-29) — pre-empt these on preprod

### Finding 1 — DeMi NFT sub-mint: the 222 user token MUST land at the order datum's `destination_address`

**THE blocker of the preview run.** The minting engine put the freshly-minted
222 user token at the payer/refund address (`sendAddress ?? returnAddress`)
instead of the address the order datum signed. `demimntmpt`'s
`check_ref_and_user_outputs` enforces `expect user_output_address ==
destination_address`, so every DeMi NFT sub-mint (scope 20) crashed
**in-contract**. The contract was sound (183 aiken tests pass) — the bug was
100% off-chain.

**Fix (`minting.handle.me` preview `236c7a1`):** in
`src/helpers/demi/processMintingTransaction.ts` the 222 output address is
`sortedHandleMap.get(handle).address` (the order's destination), with the
handle-name datum attached. **The preprod engine merge MUST carry `236c7a1`.**

```bash
grep -nE "sortedHandleMap.get\(handle\)|destination|returnAddress" \
  minting.handle.me/src/helpers/demi/processMintingTransaction.ts
# the 222 output must source the order destination, NOT returnAddress/sendAddress
```

### Finding 2 — engine DeMi package ↔ deployed `demimntmpt` must be version-LOCKED

DeMi sub mints fail with a generic eval error / ValidationTagMismatch — even
with Finding 1 fixed — when the engine's DeMi package and the on-chain
`demimntmpt` disagree on the redeemer ABI. `3.0.1` carried `free_virtual`
inside `OrderProof`; `3.0.2` dropped it (keeping only
`DiscountConfig.free_virtual_count`). Deploy the contracts AND bump the
engine's DeMi package to the SAME version in **one** cutover.

`3.0.2` is NOT on npm — it's vendored
(`file:vendor/koralabs-handles-decentralized-minting-3.0.2.tgz`).

```bash
grep -A2 'handles-decentralized-minting' minting.handle.me/package.json   # engine pkg version
# then confirm the deployed preprod demimntmpt hash == 4ae33c5f… (the yaml value)
```

### Finding 3 — heavy-build timeout: BFF needs ≥120s (REVISED for the box)

The BFF DeMi/personalize build (V3 transform + scalus eval + unoptimized-cbor
diagnostic re-eval) runs ~25–50s on a heavy wallet. The default request
timeout SIGKILLs it mid-build; the browser sees a dropped connection that
looks like CORS. On the **box (preview)** this is `KORA_FN_TIMEOUT_SECONDS=120`
threaded into the fn manifest — confirmed durable (the box's `fn deploy`
preserves it across redeploys).

⚠️ **REVISED 2026-06-29: preprod is being driven on the box, NOT AWS.** Verified
a `kora-preprod` fn app exists on the box (`ssh kora-sf 'fn list apps'`)
alongside `kora-preview` and `kora-mainnet`. So the **box mechanism applies,
same as preview** — `KORA_FN_TIMEOUT_SECONDS=120` in the fn manifest. The
earlier "preprod = AWS/Lambda timeout" guidance is SUPERSEDED.

**But the preprod box-deploy path does not exist yet** —
`handle.me/.github/workflows/deploy-box.yml` is preview-only (`on: push:
[preview]`, `NETWORK: PREVIEW`, `kora-preview-*` fns, `preview.*` domains), and
the AWS `deploy.yml` still triggers on preprod push. Establishing it is the
first hurdle (see "Box cutover log" below): either parameterize deploy-box.yml
for preprod (add `push: [preprod]` here AND drop preprod from deploy.yml, per
deploy-box.yml's own header) or deploy preprod fns manually via the
adahandle-deployments common scripts with `NETWORK=PREPROD`. Also confirm DNS
(`preprod.handle.me` / `.bff.` / `.auth.`) points at the box — a box deploy is
inert until it does.

### Finding 4 — debug a failing DeMi tx with `aiken tx simulate`, NOT scalus

scalus (`Scalus.evalPlutusScripts`) CANNOT evaluate the traced/unoptimized
`demimntmpt` build — it throws `Variable iNN@NN not found in environment`. To
get real UPLC traces from a failing DeMi sub-mint:

```bash
aiken tx simulate <tx.cbor> <inputs.cbor> <outputs.cbor> \
  --blueprint <bp.json> \
  --script-override <deployed-hash>:<unoptimized-hash> \
  --slot-length 1000 --zero-time <preprod-anchor-ms> --zero-slot 0
```

The blueprint `compiledCode` for the override must be the **unoptimized** cbor
**unwrapped once** from double-CBOR (the deployed `script_ref` is
double-encoded; aiken wants single — unwrap via
`new Serialization.CborReader(Buffer.from(cbor,'hex')).readByteString()`).
This is how Finding 1 was root-caused. (See memory
`reference_demimntmpt_traced_eval_and_burn_abi`.)

### Finding 5 — DeMi mint preflight (5 silent preconditions) + governor funding

DeMi minting has 5 preconditions that fail opaquely if missing
(`reference_demi_mint_preflight_requirements`): **render creds, governor stake
registered, tx validity window ≤900 slots, `$handle_policies` present, and
≥13 ADA collateral**. The minting fees flow to the **governor / minting
wallet** — a single-key enterprise wallet, NOT a multisig (so it can be
topped up / borrowed from directly). For preprod: fund the preprod governor
(`mint_governor = 28db779a…`), register its stake, confirm ≥13 ADA collateral
before scopes 19–22. `DEMI_MIN_COLLATERAL` = 13 ADA (centralized in the
engine constants).

### Finding 6 — operational cautions carried from the preview DeMi work

- **Contracts deploy MANUALLY** (local planner → Eternl/multisig), per
  `../../docs/MANUAL-DEPLOY-RUNBOOK.md` — NOT the stale GH workflow.
- **`handlecontract` = 3 distinct signers** — don't conflate them
  (`reference_handlecontract_terminology`): ROOT (`1c8adfe1…`) vs contract
  SubHandles (multisig `688edc94…`) vs admin (`4da965a0…`, the demimntmpt
  signer).
- **`syncMintingDataRoot` is operator-only and the most dangerous tool** —
  NEVER run it to "fix" an apparent MPT drift without first calculating the
  root independently (`feedback_mpt_calculate_independently_first`). The
  preview "drift" this session was a false alarm — the root matched chain; the
  real bug was Finding 1. Don't reach for it reflexively on preprod.
- **Env-branch discipline**: `preview → preprod → mainnet` are staged; do not
  push concurrently, and never propagate to mainnet without explicit per-deploy
  authorization (`feedback_no_unauthorized_mainnet`).

---

## Box cutover log — issues hit + mainnet-prep notes

> **This is the primary running deliverable of the first preprod-on-box cutover.**
> Every divergence from expectation, every box-vs-AWS difference, every fix —
> append it here, dated, as you go. `kora-mainnet` is also a box app, so these
> notes are the seed for the eventual mainnet cutover (there is no mainnet
> cutover doc yet — this log becomes it). Logging is not optional.

### Starting map — known divergences to resolve first (grounding check 2026-06-29)
- `kora-preprod` fn app EXISTS on the box; preprod is provisioned there
  (`kora-preview` / `kora-preprod` / `kora-mainnet` all present).
- `deploy-box.yml` is preview-only — **no preprod target**. AWS `deploy.yml`
  still owns preprod push. Establish the box deploy path before anything else
  (Finding 3).
- **DNS unknown**: confirm `preprod.handle.me` / `preprod.bff.handle.me` /
  `preprod.auth.handle.me` resolve to the box vs still AWS. A box deploy is
  inert until DNS points at the box.
- minting.handle.me preprod branch DeMi package is stale (`2.0.3` on the main
  checkout); the preview branch carries `3.0.2` + the sub-mint fix (`236c7a1`).
  Reconcile/merge forward before the engine deploy (Findings 1 + 2).

### Run log
_(empty — the first preprod-on-box cutover run populates this; date each entry)_
