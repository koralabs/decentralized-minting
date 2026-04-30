# Repository Map

## Purpose

This document is a code-oriented map of the current repository. It is meant to answer a simple question quickly: if a De-Mi change touches a particular behavior, where is the real source of truth?

## Top-Level Layout

### `smart-contract/`

This folder contains the Aiken source for the on-chain validators and supporting libraries.

Key subareas:
- `validators/`: top-level validators for `demimntprx`, `demimnt`, `demimntmpt`, and `demiord`
- `lib/decentralized_minting/`: datum and validation helpers used by those validators
- `lib/validations/`: validation-specific modules
- `lib/tests/`: Aiken-level tests
- `plutus.json`: built blueprint artifact consumed by the TypeScript side

If a change affects script semantics, this is the first place to inspect.

### `src/contracts/`

This is the TypeScript contract-adaptation layer. It turns compiled Aiken artifacts into reusable application primitives:
- `optimized-blueprint.ts` and `unoptimized-blueprint.ts` load the generated blueprint data,
- `validators.ts` locates validators by title and applies runtime parameters,
- `config.ts` derives hashes, script addresses, and staking addresses,
- `data/*` encodes and decodes datum/redeemer structures,
- `types/*` defines the TypeScript models corresponding to those contract payloads.

If a change is about "how the off-chain code understands the validator", it usually lands here.

### `src/configs/`

This folder contains live chain/config fetchers for De-Mi settings handles:
- `fetchSettings`
- `fetchMintingData`
- `fetchHandlePriceInfoData`

These functions bridge Handle API and Blockfrost responses into internal descriptors that the tx builders can consume. If a bug involves stale datum parsing, missing inline datum assumptions, or asset-to-UTxO reconstruction, inspect this folder.

### `src/txs/`

This is the main transaction-building surface for product behavior:
- `order.ts`: order request/cancel helpers and order UTxO validation
- `prepareNewMint.ts`: declarative plan for new-handle minting
- `mintNew.ts`: final new-handle mint assembly and CBOR serialization
- `prepareLegacyMint.ts`: legacy migration plan assembly
- `deploy.ts`: per-contract deploy payload builder and deployed-script fetchers
- `staking.ts`: unsigned stake-registration tx builder
- `txPlan.ts`: generic plan finalizer shared by minting flows

When a request says "change how the tx is built", this folder is almost always the operational center.

### `src/deploymentState.ts`

This file owns the desired-state YAML schema. It is the right place for:
- adding or tightening deployment config validation,
- adjusting which fields are legal in committed YAML,
- changing how contract targets or settings values are represented structurally.

It is not the place to fetch live chain state or to decide rollout ordering.

### `src/deploymentPlan.ts`

This file is the comparison and summary engine for deployments. It owns:
- fetching live scripts,
- fetching live settings handles,
- recomputing the MPT root from the live handle set,
- discovering the next deployment subhandle,
- rendering markdown and JSON summaries,
- wrapping unsigned tx artifacts with CBOR bytes and size metadata.

If a change affects rollout summaries, drift classification, or how deployment artifacts are packaged, start here.

### `src/deploymentTx.ts`

This file owns the low-level unsigned tx builders used by the planner:
- reference-script deployment txs,
- settings update txs,
- preparation txs that fund the admin signer,
- MPT migration txs.

It is intentionally separate from `src/txs/*` because deployment txs have a different trust and signing model than minting txs.

### `src/helpers/`

These are shared utility layers:
- `api.ts`: Handle API request helper and header composition
- `blockfrost/*`: Blockfrost host, network, and UTxO access helpers
- `cardano-sdk/*`: Cardano SDK compatibility shims, CBOR helpers, script-data-hash handling
- `error/*`: error conversion and result wrappers
- `common/*`: invariants and light shared helpers

This folder is the likely destination when a change is not product behavior itself but a cross-cutting implementation detail.

### `src/store/`

The trie store helpers live here:
- initialize a store-backed trie,
- fill it with handles,
- add/remove keys,
- print proofs,
- clear the backing directory.

Any issue involving local root-hash drift, proof generation, or operational trie discipline should inspect this folder alongside the mint-preparation files.

### `deploy/`

This folder contains committed desired-state YAML and stored unoptimized CBOR files for each network:
- `deploy/preview/`
- `deploy/preprod/`
- `deploy/mainnet/`

These files describe intended deployment state, not live observed state. If a change is purely about "what should be live", it probably belongs here plus the corresponding docs.

### `scripts/`

The only current operational script on `master` is `generateDeploymentPlan.ts`, plus a Python helper for ensuring handlecontract sessions.

This matters because older docs may mention a broader interactive CLI tree. For the current branch, deployment planning is the supported script workflow and most other behavior is library-driven.

### `tests/`

The committed Vitest suite currently focuses on:
- deployment plan behavior,
- desired-state parsing,
- trie store helpers,
- low-level Cardano SDK helpers such as script-parameter and CBOR handling.

The tests directory should be read as evidence of what the repo currently guards directly, not as a full product inventory.

## How the Pieces Connect

### Contract-Build Path

`smart-contract/` produces blueprint artifacts that `src/contracts/*` consumes. `buildContracts` is the off-chain abstraction that turns those blueprints into network-specific hashes and addresses. `src/txs/deploy.ts` packages those built validators into deployable payloads.

### Mint Path

The mint path starts with live data:
- settings handles via `src/configs/index.ts`,
- deployed script refs via `src/txs/deploy.ts`,
- local trie state via `src/store/index.ts`.

`prepareNewMint.ts` or `prepareLegacyMint.ts` then builds a `TxPlan`. `mintNew.ts` extends that plan for new-handle minting and delegates final coin selection and CBOR serialization to `txPlan.ts`.

### Deployment Path

The deployment path starts with committed YAML in `deploy/`. `src/deploymentState.ts` validates it. `src/deploymentPlan.ts` fetches the live comparison state and produces the review summary. `src/deploymentTx.ts` builds the unsigned rollout artifacts when the operator has provided the required network credentials and signing context.

## Common Change Scenarios

### "A contract parameter changed"

Expect to touch:
- `smart-contract/` if on-chain semantics changed,
- `src/contracts/config.ts` or `src/contracts/validators.ts` if parameter application changed,
- `deploy/<network>/decentralized-minting.yaml`,
- product/spec docs that describe deployment intent or parameter meaning.

### "The planner generated the wrong rollout summary"

Inspect:
- `src/deploymentState.ts` for desired-state interpretation,
- `src/deploymentPlan.ts` for live fetches, ignored-path handling, and drift classification,
- `tests/deploymentPlan.test.ts` and `tests/deploymentState.test.ts`.

### "A mint tx is invalid or underfunded"

Inspect:
- `src/txs/prepareNewMint.ts` or `src/txs/prepareLegacyMint.ts`,
- `src/txs/mintNew.ts`,
- `src/txs/txPlan.ts`,
- `src/helpers/cardano-sdk/*`,
- `src/configs/index.ts`.

### "The docs mention an entry point that no longer exists"

Inspect:
- `docs/product/*`,
- `docs/spec/*`,
- `scripts/`,
- `package.json`.

For the current branch, this is especially relevant to older references to `scripts/run/*`.

## Reading Order for New Engineers or Agents

If you need to understand the repo quickly, the highest-signal order is:
1. `docs/product/prd.md`
2. `docs/product/operating-model.md`
3. `docs/spec/spec.md`
4. `docs/spec/contract-deployment-pipeline.md`
5. `src/deploymentState.ts`
6. `src/deploymentPlan.ts`
7. `src/txs/txPlan.ts`
8. the specific source file for the behavior being changed

That order mirrors how the repository is meant to be used: understand the operational boundary first, then the deployment/minting model, then the specific implementation.
