# Technical Spec

## Architecture

### Core Layers
- `src/contracts/*`: validator decoding, datum/redeemer codecs, typed models.
- `src/txs/*`: transaction construction and deploy/staking workflows.
- `src/configs/*`: chain-state fetch + datum decode for settings/minting/price info.
- `src/helpers/*`: API access, env config access, network/error utilities.
- `src/store/*`: local merkle-patricia trie persistence helpers.
- `scripts/run/*`: interactive operator workflows.

### Contract Source of Truth
- Validator programs are loaded from:
  - `src/contracts/optimized-blueprint.ts`
  - `src/contracts/unoptimized-blueprint.ts`
- `src/contracts/validators.ts` locates validators by title and applies parameters:
  - `demimntprx.mint`
  - `demimnt.withdraw`
  - `demimntmpt.spend`
  - `demiord.spend`

## Transaction Flows

### 1. Order Request
1. Fetch handle-price info datum.
2. Calculate handle price from requested name.
3. Validate requester address shape (not Byron, not script credential).
4. Build tx that pays order script with inline `OrderDatum`.

Entry point: `request` in `src/txs/order.ts`.

### 2. Order Cancel
1. Resolve deployed `orders` script details.
2. Attach order script UPLC.
3. Spend order UTxO with cancel redeemer.
4. Require signer from requester spending credential.

Entry point: `cancel` in `src/txs/order.ts`.

### 3. New Mint Preparation
1. Resolve deployed script references with `fetchAllDeployedScripts`.
2. Fetch and decode settings, minting data, and handle-price info assets.
3. Assert local trie hash matches on-chain `minting_data.mpt_root_hash`.
4. Insert new handles into local trie and build MPT proofs.
5. Build tx:
  - signer = allowed minter index `0`,
  - reference inputs for scripts/settings,
  - spend/relock minting-data and handle-price-info assets,
  - mint-v1 withdrawal redeemer,
  - treasury and minter fee outputs.

Entry point: `prepareNewMintTransaction` in `src/txs/prepareNewMint.ts`.

### 4. New Mint Execution
1. Sort order UTxOs lexicographically.
2. Decode order datum per UTxO.
3. Validate order lovelace against handle price.
4. Mint `PREFIX_100` and `PREFIX_222` assets under new policy hash.
5. Spend order UTxOs and route outputs:
  - reference asset -> `settingsV1.pz_script_address`
  - user asset -> order destination

Entry point: `mintNewHandles` in `src/txs/mintNew.ts`.

### 5. Legacy Mint Preparation
1. Resolve `minting_data` reference script.
2. Fetch/decode minting data asset.
3. Assert local trie hash matches on-chain root.
4. Insert legacy handles to trie and build `LegacyHandleProof[]`.
5. Spend and relock minting-data asset with updated root.

Entry point: `prepareLegacyMintTransaction` in `src/txs/prepareLegacyMint.ts`.

### 6. Staking Registration
1. Parse target staking address.
2. Build registration cert tx using operator address and UTxOs.
3. Return signed-agnostic tx cbor hex.

Entry point: `registerStakingAddress` in `src/txs/staking.ts`.

## Script Deployment Path
- `deploy` in `src/txs/deploy.ts` returns contract-specific payload:
  - optimized/unoptimized CBOR,
  - parameter datum CBOR (where applicable),
  - validator hash and policy/address fields.

## Error and Result Model
- Most exported tx/config helpers return `Result<T, Error|string>` (`ts-res`).
- Low-level exceptions are wrapped via helper guards (`mayFail`, `mayFailAsync`, `invariant`).
- MPT mismatch and unsupported address/network states fail fast.

## CLI Surface
- Main loop (`scripts/run/index.ts`) has two planes:
  - `mpt`: trie lifecycle/actions.
  - `on-chain`: deploy, settings datum, minting data datum, staking registration, request, mint.

## Test and Coverage
- Integration behavior is covered in `tests/mint.test.ts`.
- Guardrail coverage task is implemented through `test_coverage.sh`.
- Output summary is stored at `test_coverage.report`.
