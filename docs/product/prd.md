# Decentralized Minting PRD

## Summary
`decentralized-minting` is the canonical repository for Ada Handles De-Mi validator packaging, mint-transaction preparation helpers, and deployment-planning artifacts. The current `master` branch is library-first: it exports TypeScript helpers for order, mint, staking, contract-build, and deployment-plan generation, and it keeps the desired on-chain state for `preview`, `preprod`, and `mainnet` under `deploy/<network>/decentralized-minting.yaml`.

The repository does not ship a hosted service and does not currently expose the older interactive `scripts/run/*` CLI flow described by historical documentation. Instead, the present product surface is:
- parameterized Aiken validators and their deployment payloads,
- transaction-planning helpers that return unsigned CBOR or declarative `TxPlan` objects,
- deployment-drift detection between committed desired state and live chain state,
- operational documentation that explains what must be signed manually and what must remain deterministic.

## Problem
Ada Handles minting has three hard problems that must stay aligned at all times:
- the on-chain validator set must be reproducible from committed source and explicit parameters,
- minting must preserve the Merkle-Patricia Trie root that proves handle uniqueness and prevents duplicate issuance,
- deployment and settings changes must be reviewed as drift against live chain state instead of being assembled ad hoc by operators.

This repository exists so the product team has one place to reason about those concerns together. If contract code, TypeScript builders, desired deployment YAML, and documentation drift apart, the operational risk is high: an unsigned deployment artifact can target the wrong script address, a mint builder can use stale settings hashes, or an operator can approve a rollout without realizing that only part of the live configuration changed.

## Users
- Kora Labs operators preparing and reviewing De-Mi deployments.
- Internal integrators who need deterministic order, mint, or staking helpers from the package exports in `src/index.ts`.
- Engineers maintaining desired-state YAML and auditing whether current chain state matches the intended validator and settings configuration.
- AI agents or automation that need a reliable textual map of the repo before making contract or deployment changes.

## Goals
- Provide one canonical source for building De-Mi contract hashes, addresses, datum payloads, and unsigned transactions.
- Ensure mint preparation fails fast when the local trie root and on-chain `handle_root@handle_settings` datum disagree.
- Keep deployment planning deterministic by comparing committed desired state with live scripts and live settings handles.
- Preserve a clean human approval boundary: this repo may build artifacts, but it must not silently sign or submit governance-sensitive transactions.
- Keep product docs aligned to the actual file tree so operators and agents do not depend on removed or historical entry points.

## Non-Goals
- End-user web UX.
- Wallet UI integration.
- A long-running minting daemon or scheduler.
- Generic Cardano indexing; this project consumes upstream APIs instead of owning a chain indexer.
- Automatic deployment approval or automatic wallet signing.

## Product Requirements

### 1. Desired-State Ownership
The repo must define what De-Mi intends to have live on each supported network. That desired state includes:
- build parameters such as `mint_version`, the legacy policy ID, and the admin verification key hash,
- the required settings handles and comparable settings values,
- the contract identities that should exist for the four De-Mi scripts,
- the settings paths that are intentionally ignored during drift comparison, most notably the frequently changing MPT root hash.

Desired state must remain reviewable in Git and machine-parseable by the deployment planner. It must not contain observed-only fields such as the currently deployed tx hash or the live UTxO ref, because those values are artifacts of a rollout, not the repo's declared intent.

### 2. Deployment-Planning Workflow
Operators must be able to run one deterministic planner command against a desired YAML file and receive:
- a structured JSON summary,
- a markdown summary suitable for human review,
- a machine-readable deployment plan,
- unsigned transaction artifacts when the repo has enough information to build them.

The planner must compare compiled expected hashes against live Handle API script metadata, compare desired settings against the currently deployed handle datums, and classify each contract as `no_change`, `script_hash_only`, `settings_only`, or `script_hash_and_settings`. When script hashes change, the planner must determine the next valid `@handlecontract` subhandle instead of guessing.

### 3. Contract Packaging
The package must continue to expose reproducible builds for the four De-Mi contracts:
- `demimntprx.mint`,
- `demimntmpt.spend`,
- `demimnt.withdraw`,
- `demiord.spend`.

For each contract, the repo must be able to produce the optimized CBOR, the unoptimized CBOR when available, the parameter datum where applicable, and the derived hash or address information required by downstream tooling.

### 4. Mint-Preparation Workflow
The off-chain SDK must keep supporting the two core mint-preparation flows:
- new-handle minting from order UTxOs,
- legacy-handle migration minting into the De-Mi policy.

Both flows must treat the trie root as a hard invariant. The builders may update the local trie only while constructing the next state transition, and they must stop with an error if the persisted local trie and live on-chain minting-data datum disagree before work begins.

The product surface deliberately returns unsigned transaction data rather than submitting transactions directly. Callers are responsible for wallet integration, final signatures, and submission discipline.

### 5. Order and Staking Helpers
The package must continue to provide reusable primitives for:
- order request output construction,
- order cancellation redeemer/signer derivation,
- order UTxO filtering and price validation,
- staking registration transaction assembly for the `demimnt` withdrawal credential.

These helpers exist so upstream services can compose De-Mi behavior without re-implementing datum codecs, script-hash lookup rules, or Cardano SDK witness quirks.

### 6. Explicit Trust Boundaries
The product must remain honest about what it trusts:
- Handle API provides handle metadata, deployed script metadata, script CBOR, and inline datum fetches.
- Blockfrost provides network-aware UTxOs and protocol parameters used for fee estimation and transaction sizing.
- The local trie store provides the mutable off-chain state required to prove new insertions.

If any of those sources are unavailable or inconsistent, the library should fail loudly rather than continue with hidden fallbacks.

## Operational Expectations

### Manual Approval Is a Feature
Unsigned artifacts are not an incomplete implementation; they are the product boundary. De-Mi deployment changes can move contract ownership, update mint-governor relationships, or migrate the minting-data UTxO to a new validator address. Those actions require deliberate wallet review, so the product must stop at the point where human sign-off is required.

### Documentation Must Match the Current Tree
Historical docs in this repo used to describe interactive CLI folders that no longer exist on `master`. That drift is product debt because it changes how new engineers and AI agents understand the repository. Current docs therefore need to describe the exported library, the deployment planner script, and the desired-state YAML flow that actually ships today.

### Network Coverage
The desired-state model and contract-building code support `preview`, `preprod`, and `mainnet`. Product documentation must treat those networks as first-class citizens and avoid implying that mainnet is missing when the current code can load mainnet desired state and build mainnet-specific addresses.

## Success Criteria
- Desired-state YAML for all three networks loads successfully through `loadDesiredDeploymentState`.
- Deployment-planning helpers continue to derive expected script hashes, fetch live settings/script state, and produce stable drift summaries.
- Mint-preparation helpers keep failing fast on trie-root mismatches and duplicate-handle insert attempts.
- Documentation under `docs/product` and `docs/spec` stays synchronized with the current exported SDK and deployment-planning surface.
- Where test coverage is measured, the repo should continue to enforce the existing TypeScript guardrail through `test_coverage.sh`; generated coverage artifacts should be treated as point-in-time outputs, not static source of truth.
