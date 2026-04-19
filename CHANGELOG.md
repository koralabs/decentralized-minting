# CHANGELOG

## 2.0.1

Fix package.json `main` so Node resolves the entry point without the
DEP0151 extension-resolution fallback warning.

The CI `publish.yml` copies `package.json` into `./lib/` and publishes
from there — so `lib/` is the published package root. The 2.0.0
package.json still pointed `main` at `"lib/index.js"`, which
(a) doesn't exist inside the published layout and (b) forced Node's
legacy extension-resolution to fire and emit a DEP0151 on every
import. Repointed `main` to `"index.js"`.

No code changes; byte-identical compiled output to 2.0.0.

## 2.0.0

**Breaking — full cutover from `@helios-lang/*` to `@cardano-sdk/core`.**

### Why

The bundled `@helios-lang/ledger@0.8.3` inside this package produced
Conway-invalid `script_data_hash`, and every submitted Plutus tx hit
`PPViewHashesDontMatch`. `preview.minting.handle.me` was wedged for two
days on this before the decision was made to rip out Helios wholesale.
The Helios 0.8.x line has been unpublished / deprecated upstream, so a
forward-compatible fix does not exist.

### What changed

- **Dependencies**: removed `@helios-lang/codec-utils`, `compiler`,
  `crypto`, `ledger`, `tx-utils`, `uplc`. Added `scalus` (JS/TS Plutus
  evaluator — also provides the UPLC apply primitive we need since
  `@cardano-sdk/core` has no UPLC support).
- **Conway fix**: ported `computeScriptDataHash` (MAP-format redeemers)
  and the `cborSplice` witness-set byte-preserver from
  `handle.me/bff`. Both live under `src/helpers/cardano-sdk/`. Drops
  the `PPViewHashesDontMatch` bug the whole cutover was motivated by.
- **UPLC apply**: replaces Helios's `UplcProgramV2.apply()` with
  `scalus.applyDataArgToScript()`. Cross-validated byte-for-byte on
  all three parameterized DeMi validators. Blueprint `compiledCode` is
  single-CBOR; wrap once internally to match scalus's double-CBOR
  contract.
- **Plutus data layer**: the whole `contracts/data/*.ts` and
  `contracts/types/*.ts` trees are rewritten against
  `Cardano.PlutusData` (Core shape). New `mkInt` / `mkBytes` /
  `mkList` / `mkMap` / `mkConstr` builders + `expectConstr` /
  `expectInt` / `expectList` / `expectBytesHex` expectors live in
  `src/contracts/data/plutusData.ts`.
- **Address / credential**: Helios `ShelleyAddress` /
  `SpendingCredential` / `StakingCredential` replaced by
  `Cardano.Address` / `Cardano.Credential` / bech32 strings. New
  address data builders / decoders in `plutusData.ts`.
- **Contracts API**: `buildContracts` now returns plain strings (hex
  hashes, bech32 addresses). `validators.ts` returns
  `{ optimizedCbor, unoptimizedCbor, scriptHash }` triples — no more
  `UplcProgramV2` carriers.
- **Tx builders**: `txs/prepareLegacyMint.ts`, `prepareNewMint.ts`,
  `mintNew.ts`, `order.ts`, `staking.ts` all rebuilt onto the
  cardano-sdk tx-construction stack. A shared
  `src/txs/txPlan.ts` declares the `TxPlan` intermediate shape and
  the `finalizeTxPlan` routine that runs coin selection + Conway
  script_data_hash + CBOR serialization. Plutus spends go through
  that helper uniformly.
- **Deployment**: `deploymentTx.ts`'s `buildMptRootMigrationTx` is
  now a pure cardano-sdk Plutus-spend that inlines the old
  (already-parameterized) validator as an attached script, computes
  the Conway-correct script_data_hash, and emits unsigned CBOR ready
  for admin signing. `buildPreparationTx` no longer touches Helios's
  `BlockfrostV0Client`.
- **Helpers**: `helpers/blockfrost/client.ts` deleted (only Helios
  client). `helpers/error/tx.ts` drops the `mayFailTransaction`
  wrapper. `utils/index.ts` drops `fetchNetworkParameters` and
  `createAlwaysFailUplcProgram` (both were test-only and Helios-bound).
- **Signing**: byte-splice `mergeVkeysIntoTxCbor` helper for
  preserving witness_set CBOR byte-for-byte when merging vkey
  signatures into a pre-built Plutus tx. Consumers like
  `minting.handle.me` can sign without disturbing redeemer/datum
  bytes.

### Tests

- **Added**: 19-case `cborSplice` suite; 4-case `computeScriptDataHash`
  determinism guards; 3-case `scriptParams` suite pinning
  `applyParamsToScript` hashes against the helios-era output.
- **Removed**: `tests/setup.ts`, `tests/utils.ts`,
  `tests/mint.test.ts`, `tests/txs.unit.test.ts`,
  `tests/contracts-data.unit.test.ts`, `tests/configs.unit.test.ts`,
  `tests/helpers-utils.unit.test.ts`,
  `tests/prepareMintTransactions.unit.test.ts`. All were built around
  Helios's `Emulator` / `SimpleWallet` and moved off the Helios
  surface wholesale — a non-Helios integration test harness is
  deferred as a follow-up.

### Migration notes for consumers

- `prepareLegacyMintTransaction` / `prepareNewMintTransaction` /
  `mintNewHandles` now return a `TxPlan` or finalized `{ cborHex,
  txHash, consumedInputs, estimatedSignedTxSize }` instead of a
  Helios `TxBuilder`. Callers that used to extend a `TxBuilder` and
  call `.build({ changeAddress, spareUtxos })` must provide
  `walletUtxos` + `changeAddress` upfront and either consume the
  finalized CBOR or extend the `TxPlan` themselves before calling
  `finalizeTxPlan`.
- `fetchSettings` / `fetchMintingData` / `fetchHandlePriceInfoData`
  now return a `UtxoDescriptor` (plain strings + asset map + inline
  datum CBOR) instead of a Helios `TxInput`.
- `order.request` / `order.cancel` now return datum CBORs / redeemer
  CBORs rather than partial `TxBuilder`s.
