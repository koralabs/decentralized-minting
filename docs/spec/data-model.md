# Data Model

## Asset Prefixes and Fixed Handles

| Symbol | Hex Prefix / Value | Meaning |
| --- | --- | --- |
| `PREFIX_100` | `000643b0` | Reference token label |
| `PREFIX_222` | `000de140` | User NFT handle label |
| `PREFIX_333` | `0014df10` | Fungible token label |
| `PREFIX_444` | `001bc280` | Rich-fungible token label |
| `PREFIX_000` | `00000000` | Virtual sub-handle label |
| `PREFIX_001` | `00001070` | Root handle settings prefix |
| `SETTINGS_HANDLE_NAME` | `demi@handle_settings` | Settings asset handle |
| `MINTING_DATA_HANDLE_NAME` | `handle_root@handle_settings` | Minting-data asset handle |
| `HANDLE_PRICE_INFO_HANDLE_NAME` | `kora@handle_prices` | Handle-price asset handle |

Defined in `src/constants/index.ts`.

## Desired Deployment State Schema

`DesiredDeploymentState` in `src/deploymentState.ts` is the highest-value repo-owned data structure because it is the source of truth for deployment intent. It contains:
- `schemaVersion`: currently fixed to `2`,
- `network`: one of `preview`, `preprod`, or `mainnet`,
- `buildParameters`: the exact contract parameter set used when rebuilding expected hashes,
- `assignedHandles`: the logical settings and script handles the rollout cares about,
- `ignoredSettings`: settings paths that are intentionally excluded from drift comparison,
- `settings`: a structured representation of the comparable live settings state,
- `contracts`: the four De-Mi deployment targets plus their build metadata.

Important constraint: desired state intentionally excludes live-only fields such as the current tx hash, current subhandle, or last deployed timestamp. Those belong to generated rollout artifacts, not committed policy.

## Contract Types

### `Settings` (`src/contracts/types/settings-proxy.ts`)
- `mint_governor: string`
- `mint_version: bigint`
- `data: UplcData` (payload decoded by settings-v1 codec)

### `SettingsV1` (`src/contracts/types/settings-v1.ts`)
- `policy_id: string`
- `allowed_minters: string[]`
- `valid_handle_price_assets: string[]`
- `treasury_address: Address`
- `treasury_fee_percentage: bigint`
- `pz_script_address: Address`
- `order_script_hash: string`
- `minting_data_script_hash: string`

### `MintingData` (`src/contracts/types/minting_data.ts`)
- `mpt_root_hash: string`

### `OrderDatum` (`src/contracts/types/order.ts`)
- `owner: UplcData`
- `requested_handle: string` (hex, no label)
- `destination_address: ShelleyAddress`

### `HandlePriceInfo` (`src/contracts/types/handle_price.ts`)
- `current_data: bigint[]` (`[ultraRare, rare, common, basic]` in lovelace)
- `prev_data: bigint[]`
- `updated_at: bigint`

### Handle DTOs (`src/contracts/types/handle.ts`)
- `NewHandle`: hex/utf8 name, destination, minter fee, treasury fee.
- `LegacyHandle`: hex/utf8 name, `isVirtual`.

## Runtime Descriptor Types

### `UtxoDescriptor` (`src/configs/index.ts`)

This structure is the bridge between API responses and real transaction inputs. It captures:
- `txHash`
- `outputIndex`
- `address`
- `lovelace`
- `assets: Map<string, bigint>`
- optional `inlineDatumCbor`

It deliberately contains only the information De-Mi needs to reconstruct a core Cardano SDK UTxO. That keeps config fetchers independent from any older Helios-specific types.

### `DeployData` (`src/txs/deploy.ts`)

This structure is the deploy-time representation of one parameterized validator:
- `optimizedCbor`
- optional `unOptimizedCbor`
- optional `datumCbor`
- `validatorHash`
- optional `policyId`
- optional `scriptAddress`
- optional `scriptStakingAddress`

It is not a live deployment record. It is the static package needed to publish or compare one contract.

### `TxPlan` and `FinalizedTx` (`src/txs/txPlan.ts`)

`TxPlan` is the declarative transaction model used by minting flows before coin selection and final serialization. It includes:
- preselected UTxOs,
- spare wallet UTxOs,
- outputs,
- reference inputs,
- mint map,
- withdrawals,
- certificates,
- redeemers,
- required signers,
- collateral,
- change address,
- protocol-parameter context,
- optional witness datums.

`FinalizedTx` is the post-finalization artifact:
- unsigned tx CBOR hex,
- tx hash,
- consumed input refs,
- estimated signed tx size.

This separation is important because the minting helpers need to express intent first and only later commit to exact fees, selected inputs, and final CBOR.

## Datum and Redeemer Encodings

### Settings Datum
- `buildSettingsData` / `decodeSettingsDatum`: `Constr(0, [mint_governor, mint_version, data])`
- `buildSettingsV1Data` / `decodeSettingsV1Data`: v1 payload codec.

### Minting Data
- `buildMintingData` / `decodeMintingDataDatum`: `Constr(0, [mpt_root_hash])`
- Redeemers:
  - mint new handles: `Constr(0, [proofs, minter_index])`
  - mint legacy handles: `Constr(1, [legacy_proofs])`
  - update mpt: `Constr(2, [])`

### Order Datum
- `buildOrderData` / `decodeOrderDatum`: `Constr(0, [owner, requested_handle, destination_address])`
- Redeemers:
  - execute: `Constr(0, [])`
  - cancel: `Constr(1, [])`

### Handle Price Datum
- `buildHandlePriceInfoData` / `decodeHandlePriceInfoDatum`: `Constr(0, [current_data, prev_data, updated_at])`

## Deployment Planning Types

### Expected and Live Contract State

`src/deploymentPlan.ts` models contract comparison through:
- `ExpectedContractState`: `contractSlug`, `scriptType`, `expectedScriptHash`
- `LiveContractState`: `contractSlug`, `scriptType`, `currentScriptHash`, `currentSubhandle`

The planner never compares raw CBOR first. It compares the derived hashes that matter on-chain, then uses the handle/subhandle metadata to decide whether a new deployment handle allocation is required.

### Live Settings State

`LiveSettingsState` contains:
- `currentSettingsUtxoRefs`
- `values`

The `values` payload is intentionally YAML-shaped so it can be diffed directly against `DesiredDeploymentState.settings.values` after ignored paths are removed.

### Unsigned Deployment Artifact

`UnsignedDeploymentTxArtifact` contains:
- raw `cborBytes`,
- printable `cborHex`,
- `estimatedSignedTxSize`,
- `maxTxSize`,
- `consumedInputs`.

The dual byte/hex representation exists because downstream signing tools want the raw CBOR file, while human review and sidecar tooling often want the hex string.

## Deployment Data Contract

`deploy` returns a per-script payload with:
- `optimizedCbor`
- `unOptimizedCbor?`
- `datumCbor?`
- `validatorHash`
- optional `policyId`, `scriptAddress`, `scriptStakingAddress`

Used by operator tooling to publish script metadata and parameter proof.

## Why the Model Looks This Way

Several design choices in the data model are worth calling out:
- numeric lovelace and fee values stay numeric or bigint until the last possible moment to avoid accidental decimal handling,
- maps are used for assets instead of arrays so duplicate asset IDs cannot be silently represented,
- desired and live settings share the same logical shape so drift comparison can stay structural,
- unsigned deployment artifacts carry consumed input refs because the planner may need to generate several txs in sequence without double-spending the same script UTxO.

The common theme is that De-Mi treats ambiguity as risk. The data structures are designed to make important distinctions explicit instead of encoding them implicitly in ad hoc JSON.
