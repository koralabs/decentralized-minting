# Runtime Dependencies

## External Services

### Handle API
- Base URL defaults to `https://<network>.api.handle.me` via `HANDLE_API_ENDPOINT`.
- Used for:
  - handle data (`handles/*`),
  - script metadata (`scripts?latest=true&type=...`).
- Request headers include:
  - `User-Agent: <KORA_USER_AGENT>`
  - `api-key: <HANDLE_ME_API_KEY>`

### Blockfrost
- Used for network-aware UTxO reads and tx build context.
- Network is inferred from Blockfrost key prefix in `getNetwork`.

## Environment Inputs

| Variable | Purpose | Used In |
| --- | --- | --- |
| `NODE_ENV` | Select local env file | `src/constants/index.ts` |
| `NETWORK` | CLI/runtime network (`preview`, `preprod`, `mainnet`) | `src/constants/index.ts`, `scripts/run/*` |
| `BLOCKFROST_API_KEY` | Blockfrost auth + network inference | `src/constants/index.ts`, `src/helpers/blockfrost/*`, `scripts/run/on-chain.ts` |
| `KORA_USER_AGENT` | Required user-agent for `*.handle.me` API calls | `src/constants/index.ts`, `src/helpers/api.ts` |
| `HANDLE_ME_API_KEY` | `api.handle.me` authentication | `src/constants/index.ts`, `src/helpers/api.ts` |
| `HANDLE_API_ENDPOINT` | Optional override for handle API host | `src/constants/index.ts` |
| `STORE_DIRECTORY` | Root directory for local MPT DB files | `scripts/constants.ts` |

## Local State
- Trie DB files are created under `<STORE_DIRECTORY>/<network>-db`.
- Mint preparation mutates local trie state before final tx submission; failed submission requires operator rollback/reload discipline.

## Network Config Packs
- Script settings data templates are selected by `GET_CONFIGS(network)`:
  - `preview.config.ts`
  - `preprod.config.ts`
- `GET_CONFIGS("mainnet")` currently throws (`Mainnet not configured yet`) for settings-datum generation path.
