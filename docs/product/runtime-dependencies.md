# Runtime Dependencies

## External Services

### Handle API
- Base URL defaults to `https://<network>.api.handle.me` through `HANDLE_API_ENDPOINT`, where `<network>.` is empty for mainnet and `preview.` or `preprod.` elsewhere.
- Used for:
  - handle metadata lookups such as `handles/<handle>`,
  - datum fetches such as `handles/<handle>/datum`,
  - script metadata lookups such as `scripts?latest=true&type=<scriptType>`,
  - deployed script CBOR fetches such as `handles/<handle>/script`,
  - full-handle scans when recomputing the MPT root during migration planning.
- Request headers include:
  - `User-Agent: <KORA_USER_AGENT>`
  - `api-key: <HANDLE_ME_API_KEY>` on authenticated API paths.

The repo assumes Handle API is the canonical read surface for deployed Handle metadata. If it is unavailable or returns partial data, planners and tx builders should be treated as blocked rather than "best effort".

### Blockfrost
- Used for:
  - UTxO fetches needed to reconstruct real tx inputs and outputs,
  - protocol parameters used by `@cardano-sdk/tx-construction`,
  - network-aware fee, collateral, and tx-size estimation,
  - address-scoped UTxO discovery for deployment and settings-update transactions.
- Network is inferred from the `BLOCKFROST_API_KEY` prefix in `getNetwork`.

Blockfrost is operationally required for most finalized tx assembly. The repo can still build some static plan summaries without it, but it cannot reliably produce unsigned deployment artifacts or fee-accurate Plutus transactions without protocol parameters.

## Smart-Contract Toolchain

### Aiken

The on-chain validators live in `smart-contract/` and are built with Aiken. Repo scripts and docs assume:
- `aiken build` produces the blueprint consumed by `src/contracts/optimized-blueprint.ts` and `src/contracts/unoptimized-blueprint.ts`,
- `aiken check` is the canonical contract-level test command,
- the contract source of truth remains the `.ak` files, not only the generated `plutus.json`.

### Cardano SDK Packages

The repo depends on `@cardano-sdk/core`, `@cardano-sdk/input-selection`, and `@cardano-sdk/tx-construction` for transaction assembly. These packages are wrapped by local helpers so the repo can control:
- script data hash calculation,
- placeholder signature sizing,
- native-script fee safety margins,
- address and asset conversion details.

That wrapper layer is important because De-Mi relies on Conway-era correctness and cannot afford accidental changes in witness or fee behavior.

## Environment Inputs

| Variable | Purpose | Used In |
| --- | --- | --- |
| `NODE_ENV` | Select local env file | `src/constants/index.ts` |
| `NETWORK` | Network prefix used for default Handle API host selection | `src/constants/index.ts` |
| `BLOCKFROST_API_KEY` | Blockfrost auth and network inference | `src/constants/index.ts`, `src/helpers/blockfrost/*`, `src/configs/index.ts`, `src/txs/*`, `src/deploymentTx.ts`, `scripts/generateDeploymentPlan.ts` |
| `KORA_USER_AGENT` | Required user-agent for `*.handle.me` API calls | `src/constants/index.ts`, `src/helpers/api.ts` |
| `HANDLE_ME_API_KEY` | `api.handle.me` authentication | `src/constants/index.ts`, `src/helpers/api.ts` |
| `HANDLE_API_ENDPOINT` | Optional override for handle API host | `src/constants/index.ts` |
| `HANDLECONTRACT_NATIVE_SCRIPT_CBOR` | Native script witness used for reference-script and settings-update deployment artifacts | `scripts/generateDeploymentPlan.ts`, `src/deploymentTx.ts` |

`BLOCKFROST_API_KEY`, `KORA_USER_AGENT`, and `HANDLECONTRACT_NATIVE_SCRIPT_CBOR` are the minimum operational variables for the automated deployment-plan path. Mint-building code paths additionally expect wallet UTxOs, addresses, or local trie instances to be supplied by the caller at runtime rather than loaded from global environment variables.

## Local and Generated State

### Desired State

Committed desired-state files live under:

```text
deploy/preview/decentralized-minting.yaml
deploy/preprod/decentralized-minting.yaml
deploy/mainnet/decentralized-minting.yaml
```

These files are source-controlled inputs. They represent intended network state and are safe to review in PRs.

### Generated Deployment Artifacts

The planner writes derived outputs into the caller-provided artifact directory, typically containing:
- `summary.json`,
- `summary.md`,
- `deployment-plan.json`,
- `tx-XX.cbor`,
- `tx-XX.cbor.hex`,
- `tx-XX-mpt-migration.cbor` and related sidecars when a root migration is required.

These files are runtime outputs, not canonical source of truth. They should be regenerated from current desired state whenever a rollout is prepared.

### Trie Store

The trie store is passed into mint-preparation flows by the caller and is managed through `src/store/index.ts`. The repo does not currently hard-code a `STORE_DIRECTORY` environment variable in the shipping branch. Callers decide where the trie lives, but they are responsible for treating that store as mutable operational state:
- new-handle and legacy-mint builders mutate the trie while constructing the next root,
- a failed mint attempt may require rollback or a fresh trie reconstruction,
- the chain datum remains the final public commitment that the local trie must match before any mutation begins.

### Coverage and Validation Outputs

The repository also includes:
- `test_coverage.sh` to run the measurable TypeScript coverage gate,
- `test_coverage.report` as a generated point-in-time artifact,
- Vitest output from `npm test`,
- Aiken contract checks from `npm run test:aiken`.

Coverage reports should be treated as generated evidence, not as permanent documentation. If the code tree changes, the report may need regeneration before it accurately reflects current behavior.

## Authentication and Security Expectations

Two operational rules matter here:
- requests to `*.handle.me` should always include the configured `KORA_USER_AGENT`,
- deployment and settings transactions should only be built when the operator has explicitly provided the required native script witness or admin signing path.

This repo should not invent default secrets or silently continue with blank credentials. A missing credential is an operational error, not a prompt to guess.
