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

## Deployment Data Contract

`deploy` returns a per-script payload with:
- `optimizedCbor`
- `unOptimizedCbor?`
- `datumCbor?`
- `validatorHash`
- optional `policyId`, `scriptAddress`, `scriptStakingAddress`

Used by operator tooling to publish script metadata and parameter proof.
