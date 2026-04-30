# Contract Deployment Pipeline Spec

## Repository Scope
This repo owns the desired on-chain deployment state for decentralized minting contracts and their shared settings handles.

The repo defines what should be live on `preview`, `preprod`, and `mainnet`. It should not be treated as the storage location for volatile live references such as current settings UTxO refs.

Canonical slug naming for this repo follows the shared rule in `adahandle-deployments/docs/contract-deployment-pipeline.md`:
- `<app><[ord|mnt|ref|roy]><[mpt]>`
- this repo currently uses `demimntprx`, `demimntmpt`, `demimnt`, and `demiord`
- `old_script_type` is legacy migration-only

## State Model
- Desired state lives in committed YAML files in this repo.
- Observed live state is read from chain UTxOs and deployed script hashes.
- Operational automation config lives outside this repo in orchestration/control-plane repos.
- Volatile fields such as `tx_hash`, `output_index`, and current UTxO refs belong in observed-state artifacts, not committed desired-state YAML.

The current implementation splits deployment work into three technical phases:
1. parse and validate the desired-state YAML,
2. fetch and compare live script/settings state,
3. optionally build unsigned transaction artifacts for the drift that was found.

That separation is important because phase 2 can still produce a useful review summary even when phase 3 cannot proceed due to missing credentials or incomplete wallet context.

## Desired State Files
This repo uses one committed desired-state YAML per network:

```text
deploy/<network>/decentralized-minting.yaml
```

Each file carries:
- the shared build parameters for the four deployed scripts,
- the current assigned settings Handles,
- the current assigned script Handles,
- ignored settings paths,
- normalized live-comparable settings values for:
  - `demi@handle_settings`
  - `handle_root@handle_settings`
  - `kora@handle_prices`

Example shape:

```yaml
schema_version: 2
network: preview
build_parameters:
  mint_version: 0
  legacy_policy_id: <policy>
  admin_verification_key_hash: <pkh>
assigned_handles:
  settings:
    - demi@handle_settings
    - handle_root@handle_settings
    - kora@handle_prices
  scripts:
    - demimntprx1@handlecontract
ignored_settings:
  - settings.values.handle_root@handle_settings.mpt_root_hash
settings:
  type: decentralized_minting_settings
  values:
    demi@handle_settings: {}
    handle_root@handle_settings: {}
    kora@handle_prices: {}
contracts:
  - contract_slug: demimntprx
    script_type: demimntprx
    old_script_type: demi_mint_proxy
    deployment_handle_slug: demimntprx
    build:
      contract_name: demimntprx.mint
      kind: minting_policy
```

Although the YAML contains `assigned_handles`, the rollout planner may still allocate a runtime `@handlecontract` subhandle when a script hash changes. Those runtime handles are discovered from live chain state and are part of the deployment plan output, not hardcoded guesses.

## Drift Detection
Deployment automation should:
- build the contract and derive the expected script hash,
- load desired YAML from this repo,
- read live chain state for the shared settings Handles and deployed scripts,
- decode the live CBOR datums into the same YAML-shaped settings values,
- ignore configured paths such as `handle_root@handle_settings.mpt_root_hash`,
- classify drift as `no_change`, `script_hash_only`, `settings_only`, or `script_hash_and_settings`.

No deployment artifact should be created when desired and live state already match after ignored settings are removed.

The repo currently treats settings drift as shared system drift rather than contract-local drift. In other words, if `demi@handle_settings` changes, every contract entry in the plan reports the same settings diff rows even if only one tx will update the settings handle. This keeps the human summary honest about network convergence.

## Settings Scope
The comparable shared settings state in this repo is:
- `demi@handle_settings`: mint governor plus settings-v1 payload
- `handle_root@handle_settings`: minting-data datum
- `kora@handle_prices`: handle price current/previous vectors

The `mpt_root_hash` field changes frequently and is ignored by default for deployment drift.

## SubHandle Rules
- A script hash change uses the committed `deployment_handle_slug` values and allocates the next `<slug><ordinal>@handlecontract` name.
- Existing legacy live handles can remain attached to older contracts during the transition.
- Handles assigned to settings or contracts must reside alone in their UTxO — never bundled with other handles. Each settings/contract handle carries its own inline datum and optionally a reference script; combining handles in a single UTxO loses per-handle datum association and complicates downstream UTxO selection.

The current implementation tries to reuse an already minted ordinal before jumping forward. If `demimntprx2@handlecontract` already exists and is the first unused replacement after the currently active handle, the planner reuses it instead of skipping to `demimntprx3@handlecontract`.

## Artifact Generation Rules

When sufficient credentials are available, `scripts/generateDeploymentPlan.ts` can emit:
- reference-script deployment tx artifacts,
- settings update tx artifacts,
- a preparation tx to fund the admin signer when needed,
- an MPT root migration tx.

Reference-script deployment and settings-update txs rely on the native script witness configured through `HANDLECONTRACT_NATIVE_SCRIPT_CBOR`.

The MPT migration path is different:
- it may need the planner to recompute the trie root from the live handle set,
- it spends the current `handle_root@handle_settings` UTxO from the old validator,
- it sends the handle back to the new validator address with an updated datum,
- it requires the admin or policy signing path rather than only the native script witness.

## Artifact Contract
The deployment workflow for this repo emits:
- `deployment-plan.json`
- `summary.md`
- `summary.json`

When the planner has enough live-state and signing context to assemble rollout transactions, it also emits:
- raw unsigned `tx-XX.cbor`
- matching `tx-XX.cbor.hex` sidecars

In the current implementation, settings drift does not suppress tx generation. Instead, a settings update tx is generated after script deployment txs when the required inputs are available. The planner also estimates signed tx size by adding placeholder witnesses and fails before artifact publication if the projected signed size would exceed protocol `maxTxSize`.

The planner tracks consumed input refs across generated artifacts so that later txs in the same rollout do not accidentally reuse a UTxO already selected by an earlier tx.

## Human Approval Boundary
Automation prepares deployment transactions and summaries.

Humans remain responsible for:
- downloading CBOR artifacts,
- uploading/signing/submitting in Eternl,
- approving the deployment at the wallet boundary.

Post-submit automation should verify that chain state converges to the desired YAML plus any expected SubHandle change declared by the workflow.

## Operational Failure Cases

The main failure cases to understand are:
- missing `BLOCKFROST_API_KEY`: summary generation can proceed, unsigned tx generation cannot,
- missing `KORA_USER_AGENT`: live Handle API access is not trustworthy and should be treated as blocked,
- missing `HANDLECONTRACT_NATIVE_SCRIPT_CBOR`: reference-script and settings-update txs cannot be built,
- stale deployer wallet resolution: the planner may find drift but be unable to assemble the tx that fixes it,
- oversize tx artifacts: the planner aborts artifact generation rather than emitting something likely to fail on submission,
- partial live convergence: a new script may be deployed while the settings or root-handle migration remains unfinished.

Those cases are not edge conditions; they are normal reasons for an operator to stop, inspect the summary, and decide whether the next action is code, configuration, or deployment-only work.
