# Feature Matrix

| Area | Capability | Primary Modules |
| --- | --- | --- |
| Contract Build | Parameterized validator assembly for `demimntprx`, `demimntmpt`, `demimnt`, and `demiord` | `src/contracts/config.ts`, `src/contracts/validators.ts` |
| Deploy Payloads | Produce optimized/unoptimized CBOR, parameter datum CBOR, hashes, and addresses for one target contract | `src/txs/deploy.ts` |
| Desired-State Parsing | Validate `deploy/<network>/decentralized-minting.yaml` and reject observed-only fields | `src/deploymentState.ts` |
| Drift Detection | Compare desired hashes/settings with live Handle API state and classify drift | `src/deploymentPlan.ts` |
| Unsigned Deployment TXs | Build unsigned reference-script deployment and settings-update artifacts | `src/deploymentPlan.ts`, `src/deploymentTx.ts`, `scripts/generateDeploymentPlan.ts` |
| MPT Root Migration | Recompute the trie root from live handles and build migration/preparation txs when the minting-data script moves | `src/deploymentPlan.ts`, `src/deploymentTx.ts` |
| Script Discovery | Resolve latest deployed script metadata and reference-script UTxOs | `src/utils/contract.ts`, `src/txs/deploy.ts` |
| Settings Fetch | Fetch and decode `demi@handle_settings` and its nested `settings_v1` payload | `src/configs/index.ts`, `src/contracts/data/settings*.ts` |
| Minting Data Fetch | Fetch and decode `handle_root@handle_settings` | `src/configs/index.ts`, `src/contracts/data/minting_data.ts` |
| Handle Price Fetch | Fetch and decode `kora@handle_prices` | `src/configs/index.ts`, `src/contracts/data/handle_price.ts` |
| Order Request | Return script address, lovelace amount, and datum CBOR for a new order output | `src/txs/order.ts` |
| Order Cancel | Derive cancel redeemer CBOR and required signer hash for an existing order UTxO | `src/txs/order.ts` |
| Order Intake | Fetch active order UTxOs and discard malformed datum entries | `src/txs/order.ts` |
| New Mint Prepare | Build a `TxPlan` for new-handle minting, fee outputs, redeemers, withdrawals, and updated settings data | `src/txs/prepareNewMint.ts`, `src/txs/txPlan.ts` |
| New Mint Execute | Extend the prepared plan with minted `100` and `222` assets, destination outputs, and finalized unsigned CBOR | `src/txs/mintNew.ts`, `src/txs/txPlan.ts` |
| Legacy Mint Prepare | Build the minting-data spend for migration of legacy handles into the De-Mi policy | `src/txs/prepareLegacyMint.ts` |
| MPT Integrity | Enforce local trie root equals the live on-chain root before mint-related mutation | `src/txs/prepareNewMint.ts`, `src/txs/prepareLegacyMint.ts`, `src/store/index.ts` |
| Staking Ops | Generate unsigned stake-registration tx CBOR for the `demimnt` withdrawal credential | `src/txs/staking.ts` |

## Current Operating Surface

The feature table above reflects the current `master` branch, not the older operational model that depended on interactive `scripts/run/*` folders. The present repo behaves as a library plus deployment-planning toolchain:
- callers import helpers from `src/index.ts`,
- operators invoke `scripts/generateDeploymentPlan.ts` for rollout preparation,
- humans sign the resulting CBOR artifacts outside the repo.

That distinction matters when evaluating changes. A request to "add a minting workflow" should usually land as one of three things:
- a new exported helper in `src/txs/*`,
- an expansion to the desired-state/deployment-planning flow,
- a documentation update describing a manual step that intentionally remains outside the code boundary.

## Deliberate Omissions

The repo does not currently provide:
- a wallet integration layer,
- automatic transaction submission,
- a hosted REST API,
- a general-purpose operator TUI or REPL.

Those omissions are intentional. De-Mi changes can update policy-linked script relationships, move the `handle_root@handle_settings` asset between validator addresses, and require different signatures for different tx classes. Keeping those approvals outside the codebase reduces the chance that operational automation silently exceeds its authority.
