# Contract Deployment Pipeline Spec

## Repository Scope
This repo owns the desired on-chain deployment state for decentralized minting contracts and their shared settings handles.

The repo defines what should be live on `preview`, `preprod`, and `mainnet`. It should not be treated as the storage location for volatile live references such as current settings UTxO refs.

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
    - mint_proxy@demi_scripts
ignored_settings:
  - settings.values.handle_root@handle_settings.mpt_root_hash
settings:
  type: decentralized_minting_settings
  values:
    demi@handle_settings: {}
    handle_root@handle_settings: {}
    kora@handle_prices: {}
contracts:
  - contract_slug: demi-mint-proxy
    script_type: demi_mint_proxy
    deployment_handle_slug: demimprxy
    build:
      contract_name: mint_proxy.mint
      kind: minting_policy
```

## Drift Detection
Deployment automation should:
- build the contract and derive the expected script hash,
- load desired YAML from this repo,
- read live chain state for the shared settings Handles and deployed scripts,
- decode the live CBOR datums into the same YAML-shaped settings values,
- ignore configured paths such as `handle_root@handle_settings.mpt_root_hash`,
- classify drift as `no_change`, `script_hash_only`, `settings_only`, or `script_hash_and_settings`.

No deployment artifact should be created when desired and live state already match after ignored settings are removed.

## Settings Scope
The comparable shared settings state in this repo is:
- `demi@handle_settings`: mint governor plus settings-v1 payload
- `handle_root@handle_settings`: minting-data datum
- `kora@handle_prices`: handle price current/previous vectors

The `mpt_root_hash` field changes frequently and is ignored by default for deployment drift.

## SubHandle Rules
- A script hash change still requires operator review for handle replacement because the currently live namespaces are legacy handles such as `@demi_scripts` and `@handle_settings`.
- Future `*.handlecontract` allocation should use the committed `deployment_handle_slug` values, each capped at 10 characters and without separators.

## Artifact Contract
The deployment workflow for this repo currently emits:
- `deployment-plan.json`
- `summary.md`
- `summary.json`

It does not emit `tx-XX.cbor` artifacts yet. The current rollout scope is informational drift detection for the four scripts plus the shared settings handles across `preview`, `preprod`, and `mainnet`.

## Human Approval Boundary
Automation prepares deployment transactions and summaries.

Humans remain responsible for:
- downloading CBOR artifacts,
- uploading/signing/submitting in Eternl,
- approving the deployment at the wallet boundary.

Post-submit automation should verify that chain state converges to the desired YAML plus any expected SubHandle change declared by the workflow.
