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
