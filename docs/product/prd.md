# Decentralized Minting PRD

## Summary
`decentralized-minting` provides:
- De-Mi on-chain validator packaging (Aiken blueprints to parameterized UPLC).
- Off-chain TypeScript SDK for order, mint, deploy, and staking flows.
- Interactive operator CLI for MPT and on-chain actions.

## Problem
Ada Handles requires deterministic mint orchestration for:
- New-handle minting from order UTxOs.
- Legacy-handle migration minting.
- MPT-root consistency between local state and chain state.
- Script deployment metadata and staking registration support.

## Users
- Kora Labs operators running De-Mi minting and migration.
- Service integrations building txs through SDK exports in `src/index.ts`.
- Internal tooling owners maintaining deployed script metadata and settings data.

## Goals
- Provide one SDK surface for request/cancel/order validation/mint preparation.
- Ensure minting transactions are generated only when on-chain config + local MPT state are consistent.
- Keep deployment and settings/minting-data datum generation deterministic.
- Keep CLI flows minimal and practical for day-to-day ops.

## Non-Goals
- End-user web UX.
- Wallet UI integration.
- Generic Cardano indexing; this project consumes upstream APIs.

## Product Requirements

### Order Lifecycle
- Build order txs with `request({ network, address, handle })` (`src/txs/order.ts`).
- Build order-cancel txs with `cancel({ network, address, orderTxInput })`.
- Fetch and filter order UTxOs with `fetchOrdersTxInputs`.
- Validate order UTxO price sufficiency against previous/current price sets via `isValidOrderTxInput`.

### Minting Lifecycle
- Prepare new-mint transaction context with `prepareNewMintTransaction` (`src/txs/prepareNewMint.ts`):
  - pull deployed scripts, settings, minting data, and handle price info.
  - enforce local MPT root equals on-chain `minting_data`.
  - generate MPT proofs and update root.
  - build fee outputs and withdrawal/redeemer wiring.
- Complete new-handle minting with `mintNewHandles` (`src/txs/mintNew.ts`) by:
  - minting `100` (reference) + `222` (user) assets,
  - spending order UTxOs,
  - paying reference assets to PZ address and user assets to destination.
- Prepare legacy minting transactions with `prepareLegacyMintTransaction` (`src/txs/prepareLegacyMint.ts`).

### Contract and Deployment Utilities
- Build parameterized contracts (`buildContracts`) from blueprint validators.
- Emit deploy payloads (`deploy`) containing cbor, datum cbor (where applicable), hashes, and script addresses.
- Resolve all deployed script refs with `fetchAllDeployedScripts`.
- Register staking credential for `mint_v1` via `registerStakingAddress`.

### MPT Operations
- Support local trie lifecycle: `init`, `fillHandles`, `addHandle`, `removeHandle`, `printProof`, `clear`.
- Persist MPT roots to disk and reuse across CLI sessions.

### External Integrations
- Fetch handle/script/config data from `api.handle.me` via `fetchApi`.
- Authenticate handle API calls with `KORA_USER_AGENT` and `HANDLE_ME_API_KEY`.
- Use Blockfrost for UTxO lookups and network-bound transaction context.

## Success Criteria
- Core integration tests pass (`tests/mint.test.ts`).
- Coverage guardrail is met using `test_coverage.sh` and `test_coverage.report` (>=90% lines and branches).
- Product/spec docs remain synchronized with exported SDK and CLI capabilities.
