# Technical Spec

## Architecture

### Core Layers
- `smart-contract/*`: Aiken validators, validation helpers, and Aiken tests.
- `src/contracts/*`: blueprint loading, parameter application, datum/redeemer codecs, typed contract models.
- `src/txs/*`: order, mint, deploy, staking, and generic transaction-plan assembly helpers.
- `src/configs/*`: live handle/settings fetchers and datum decoders.
- `src/deploymentState.ts`: desired-state YAML parsing and schema validation.
- `src/deploymentPlan.ts`: drift detection, live-state fetching, plan rendering, and artifact wrapping.
- `src/deploymentTx.ts`: unsigned deployment/settings/migration transaction builders.
- `src/helpers/*`: Handle API access, Blockfrost context, network helpers, error conversion, and Cardano SDK shims.
- `src/store/*`: local Merkle-Patricia Trie persistence helpers.
- `scripts/generateDeploymentPlan.ts`: command-line entry point for producing rollout artifacts.

### Contract Source of Truth
- Validator programs are loaded from:
  - `src/contracts/optimized-blueprint.ts`
  - `src/contracts/unoptimized-blueprint.ts`
- `src/contracts/validators.ts` locates validators by title and applies parameters:
  - `demimntprx.mint`
  - `demimnt.withdraw`
  - `demimntmpt.spend`
  - `demiord.spend`

The current branch does not expose the older interactive operator CLI described by historical docs. All operational behavior is driven either by imported library calls or by `scripts/generateDeploymentPlan.ts`.

## Contract Build Model

`buildContracts` in `src/contracts/config.ts` is the central contract assembly function. It accepts:
- `network`,
- `mint_version`,
- `legacy_policy_id`,
- `admin_verification_key_hash`.

From those inputs it derives:
- the mint policy hash for `demimntprx`,
- the validator hash and enterprise script address for `demimntmpt`,
- the validator hash, reward account, and registration certificate for `demimnt`,
- the validator hash and enterprise script address for `demiord`.

The function is intentionally opinionated about address derivation. The repo does not allow callers to improvise script address formulas in multiple places. Instead, both minting helpers and deployment helpers consume the same built contract bundle.

## Desired-State and Drift Model

`src/deploymentState.ts` defines the desired-state schema. The parser:
- accepts only `preview`, `preprod`, or `mainnet`,
- enforces `schema_version: 2`,
- validates the four supported De-Mi contract slugs,
- rejects observed-only fields that should never be committed to source control.

`src/deploymentPlan.ts` then combines that desired state with live data from the Handle API. The resulting plan compares:
- expected script hashes from current source,
- current live script hashes,
- comparable settings values after ignored paths are removed.

The planner treats settings drift as global. If a settings value differs, every contract entry in the summary receives the same settings diff rows even if only one deployment transaction may ultimately be required. This is deliberate: the summary is designed to show whether the network as a whole is converged, not just whether one contract hash changed.

## Transaction Flows

### 1. Order Request
1. Fetch handle-price info datum.
2. Calculate handle price from requested name.
3. Validate requester address shape (not Byron, not script credential).
4. Return the orders script address, required lovelace amount, and inline `OrderDatum` CBOR.

Entry point: `request` in `src/txs/order.ts`.

### 2. Order Cancel
1. Parse the caller address as a base address.
2. Extract the payment key hash.
3. Return the cancel redeemer CBOR and required signer hash.

Entry point: `cancel` in `src/txs/order.ts`.

### 3. New Mint Preparation
1. Resolve deployed script references with `fetchAllDeployedScripts`.
2. Fetch and decode settings, minting data, and handle-price info assets.
3. Assert local trie hash matches on-chain `minting_data.mpt_root_hash`.
4. Insert new handles into local trie and build MPT proofs.
5. Build tx:
  - signer = supplied minter key hash,
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
6. Finalize the extended `TxPlan` into unsigned CBOR using the local `finalizeTxPlan` helper.

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
3. Return unsigned tx CBOR hex.

Entry point: `registerStakingAddress` in `src/txs/staking.ts`.

## Generic Tx Finalization

`src/txs/txPlan.ts` is the shared transaction-finalization layer used by the minting paths. It exists to centralize the Cardano SDK behavior that is easy to get wrong:
- coin selection with preselected script inputs,
- minimum ADA filling for zero-coin outputs,
- Conway-correct script data hash calculation,
- placeholder witness sizing for fee estimation,
- final unsigned CBOR serialization.

This is an important architectural boundary. Callers build declarative transaction intent as a `TxPlan`, and the finalizer handles the mechanical Cardano details consistently.

## Deployment Path

The deployment path is now split across three layers instead of one helper:
- `src/txs/deploy.ts` builds one contract payload at a time,
- `src/deploymentPlan.ts` compares desired and live state and wraps unsigned artifacts,
- `src/deploymentTx.ts` constructs the actual unsigned deployment and settings-update transactions.

The planner also contains De-Mi-specific logic that is not shared with general mint flows:
- recomputing the MPT root from the live handle set,
- discovering the next `@handlecontract` subhandle ordinal,
- verifying whether `handle_root@handle_settings` still sits at the expected validator address,
- sequencing multi-tx rollouts while excluding UTxOs already consumed by earlier generated artifacts.

## Error and Result Model
- Most exported tx/config helpers return `Result<T, Error|string>` (`ts-res`).
- Low-level exceptions are wrapped via helper guards (`mayFail`, `mayFailAsync`, `invariant`).
- MPT mismatch, unsupported address/network states, missing credentials, and tx-size overruns fail fast.

The deployment-plan script uses a hybrid approach: some failures abort the entire planning run, while others are logged and cause one optional artifact to be skipped. This is intentional. A rollout summary can still be useful even if one optional tx could not be prebuilt due to missing native-script CBOR or insufficient deployer-wallet context.

## Network and Data Assumptions

- The network for most minting flows is inferred from the configured Blockfrost API key prefix.
- Handle API is assumed to be the canonical read surface for live handle and script metadata.
- Desired-state YAML is assumed to be the canonical write-time declaration of intended network state.
- The local trie store is assumed to be authoritative only when its hash matches the live on-chain root datum before mutation.

## Test and Coverage
- The committed test tree currently emphasizes deployment-state parsing, deployment-plan behavior, trie persistence, and Cardano helper compatibility shims.
- The broader measurable TypeScript coverage gate is implemented through `test_coverage.sh`.
- `test_coverage.report` is a generated output and should be regenerated when coverage evidence is needed.
