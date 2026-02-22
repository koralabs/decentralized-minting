# Feature Matrix

| Area | Capability | Primary Modules |
| --- | --- | --- |
| Contract Build | Parameterized validator assembly (`mint_proxy`, `mint_v1`, `minting_data`, `orders`) | `src/contracts/config.ts`, `src/contracts/validators.ts` |
| Deployment | Produce deploy payload (validator hash, cbor, datum cbor, script address) | `src/txs/deploy.ts` |
| Script Discovery | Resolve latest deployed script metadata and reference-script UTxOs | `src/utils/contract.ts`, `src/txs/deploy.ts` |
| Settings Fetch | Fetch and decode settings/settings-v1 datum from handle assets | `src/configs/index.ts`, `src/contracts/data/settings*.ts` |
| Minting Data Fetch | Fetch and decode minting-data datum from root handle | `src/configs/index.ts`, `src/contracts/data/minting_data.ts` |
| Handle Price Fetch | Fetch and decode handle-price datum | `src/configs/index.ts`, `src/contracts/data/handle_price.ts` |
| Order Request | Build tx that locks order datum with required lovelace | `src/txs/order.ts` |
| Order Cancel | Build tx to spend order UTxO with cancel redeemer and signer | `src/txs/order.ts` |
| Order Intake | Fetch active order UTxOs and filter invalid datum entries | `src/txs/order.ts` |
| New Mint Prepare | Build tx context for new-handle mint (refs, redeemers, fees, datum updates) | `src/txs/prepareNewMint.ts` |
| New Mint Execute | Mint `100` and `222` assets and route outputs to PZ + user destinations | `src/txs/mintNew.ts` |
| Legacy Mint Prepare | Build tx context for legacy-handle migration minting | `src/txs/prepareLegacyMint.ts` |
| MPT Integrity | Enforce local trie root equals on-chain minting data root before mint | `src/txs/prepareNewMint.ts`, `src/txs/prepareLegacyMint.ts` |
| MPT Tooling | Initialize, inspect, fill, prove, add/remove handles, clear local db | `src/store/index.ts`, `scripts/run/mpt.ts` |
| Operator CLI | Interactive ops flows for deploy/settings/minting-data/staking/request/mint | `scripts/run/index.ts`, `scripts/run/on-chain.ts` |
| Staking Ops | Generate registration tx cbor for mint-v1 staking credential | `src/txs/staking.ts` |
