# User Actions Checklist

Concrete user-owned blockers the agent cannot perform. Organized by feature area.

## Deploy / infra (PHASE-5)

- [ ] **Multisig signature for the Phase-1 deploy bundle** (`DSH-602`). Ref-script deploys +
  settings update spend the `$demi…@handlecontract` tokens out of the handlecontract native
  script (1-of-2 `RequireAnyOf`, members `5b468ea6` / `d9980af9`). The agent holds neither
  (verified across policy indices null+0–20). Required: the user signs `tx-01/02/03` in Eternl
  with their handlecontract key. The agent co-signs the fee inputs (POLICY_KEY idx 12) and the
  MPT-root migration (admin/policy root `4da965a0`).
  - Blocker reason: native-script member key is user-held; permissionless deploy cannot proceed
    without it.

- [ ] **New personalization contract deploy** (`DSH-601`). The net-new nft/root burn redeemer +
  `$handle_policies`-aware policy checks (`DSH-301`/`DSH-303`) require deploying a new
  `handles-personalization` contract version; its on-chain deploy follows the personalization
  deploy process (separate from the DeMi bundle).
  - Blocker reason: on-chain contract deploy + any required signing the agent cannot perform unattended.

## Engine refactor / package publish (PHASE-5)

- [ ] **DSH-501 engine relocation — dev approach + package wiring decision** (`minting.handle.me`).
  DSH-501 relocates `processDeMiSubHandleMintingTransaction` onto the orders/`mintNewHandles`
  path (built in DSH-403). The package work is done and builds clean to `lib/`, but it is
  **unpublished** — the engine pins published `@koralabs/handles-decentralized-minting@2.0.3`
  (old API; the new mint-build API + the removed legacy free-virtual handling only exist in the
  local `decentralized-minting` branch `parity/legacy-parity-foundation`). Two user decisions are
  needed before the agent starts:
  1. **Where to work:** the engine is on the active branch `self-host/local-jwt` (5 commits ahead
     of origin — the DeMi engine work `4f46bcc/c1a2c7d/74154cf`), with an untracked WIP script
     `src/scripts/signDemiSettingsUpdate.ts`. Confirm whether to do DSH-501 on that branch or a new
     branch off it, and acknowledge the agent will not touch the untracked script.
  2. **Package wiring:** to reach a clean committed-green state the engine needs the new package
     either (a) **published** to npm (outward-facing/irreversible → needs explicit user auth; the
     task graph otherwise defers publish to `DSH-602`) + a `package.json` version bump, or (b) a
     local `npm link` / `file:` dep for development (engine's committed state then red against the
     registry until publish). Pick (a) or (b).
  - Blocker reason: starting a ~300-line money-handling refactor of the production minting engine on
    the user's active branch, requiring an unpublished-package link (or an outward-facing npm
    publish), is an intrusive/hard-to-reverse action the agent must confirm first. Its integration
    verification (DSH-405 e2e, DSH-603 on-chain) is also gated behind the blocked pz chain.

## Conditional features (personalization)

- [ ] **Pre-existing pz test failure** (`DSH-300`). `handles-personalization` HEAD (`e1cec67`) fails
  `dispatch_from_tx_update_branch_accepts_private_root_address_change` (124 pass / 1 fail) under its
  own pinned `aiken v1.1.21`. Is this a known/expected failure, or should it be fixed first? Building
  the new pz burn + `$handle_policies` work on a red baseline makes those changes unverifiable.
  - Blocker reason: needs the team's knowledge of whether this committed failure is known/acceptable.
