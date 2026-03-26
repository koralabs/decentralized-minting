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
  - `hal@handle_settings`
  - `hal_root@handle_settings`
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
    - hal@handle_settings
    - hal_root@handle_settings
    - kora@handle_prices
  scripts:
    - demimntprx1@handlecontract
ignored_settings:
  - settings.values.hal_root@handle_settings.mpt_root_hash
settings:
  type: decentralized_minting_settings
  values:
    hal@handle_settings: {}
    hal_root@handle_settings: {}
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

## Drift Detection
Deployment automation should:
- build the contract and derive the expected script hash,
- load desired YAML from this repo,
- read live chain state for the shared settings Handles and deployed scripts,
- decode the live CBOR datums into the same YAML-shaped settings values,
- ignore configured paths such as `hal_root@handle_settings.mpt_root_hash`,
- classify drift as `no_change`, `script_hash_only`, `settings_only`, or `script_hash_and_settings`.

No deployment artifact should be created when desired and live state already match after ignored settings are removed.

## Settings Scope
The comparable shared settings state in this repo is:
- `hal@handle_settings`: mint governor plus settings-v1 payload
- `hal_root@handle_settings`: minting-data datum
- `kora@handle_prices`: handle price current/previous vectors

The `mpt_root_hash` field changes frequently and is ignored by default for deployment drift.

## SubHandle Rules
- A script hash change uses the committed `deployment_handle_slug` values and allocates the next `<slug><ordinal>@handlecontract` name.
- Existing legacy live handles can remain attached to older contracts during the transition.

## Artifact Contract
The deployment workflow for this repo emits:
- `deployment-plan.json`
- `summary.md`
- `summary.json`

When the detected drift is script-hash-only and the planner is given both `change_address` and `cbor_utxos_json`, it also emits:
- raw unsigned `tx-XX.cbor`
- matching `tx-XX.cbor.hex` sidecars

Unsigned tx generation is intentionally skipped when settings drift is present. The planner also estimates the signed tx size by adding one dummy witness and fails before artifact upload if that signed size would exceed protocol `maxTxSize`.

## Human Approval Boundary
Automation prepares deployment transactions and summaries.

Humans remain responsible for:
- downloading CBOR artifacts,
- uploading/signing/submitting in Eternl,
- approving the deployment at the wallet boundary.

Post-submit automation should verify that chain state converges to the desired YAML plus any expected SubHandle change declared by the workflow.
