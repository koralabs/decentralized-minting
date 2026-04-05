# Deployment Scripts

## Automated deployment plan

The deployment pipeline detects drift between the desired state (YAML config) and what is live on-chain, then generates unsigned transaction artifacts.

```bash
npx tsx scripts/generateDeploymentPlan.ts \
  --desired deploy/preview/decentralized-minting.yaml \
  --artifacts-dir tmp/preview-deploy
```

Required environment variables:

| Variable | Purpose |
|----------|---------|
| `BLOCKFROST_API_KEY` | Blockfrost project ID for the target network |
| `KORA_USER_AGENT` | User-Agent header for Handle API calls |
| `HANDLECONTRACT_NATIVE_SCRIPT_CBOR` | Native script CBOR hex for the handlecontract address (for reference script and settings txs) |

### What the plan generates

1. **Reference script deployment txs** — When a contract's compiled hash changes, the plan deploys the new script to a `@handlecontract` subhandle. Signed with the native script.

2. **Settings update tx** — When settings values drift, the plan rebuilds the `demi@handle_settings` datum. Signed with the native script.

3. **MPT root migration tx** — When `demimntmpt.spend` changes its script hash, the `handle_root@handle_settings` UTxO must move from the old validator address to the new one. The plan:
   - Fetches the old (currently deployed) validator script from the Handle API
   - Fetches all handles from the API and builds a fresh trie to compute the new MPT root hash
   - Builds an unsigned tx that spends the handle via the `UpdateMPT` redeemer and sends it to the new script address with the recomputed hash
   - **This tx requires the admin/policy key signature** (not the native script)

   The migration artifact is named `tx-XX-mpt-migration.cbor` to distinguish it from native-script txs.

### Transaction ordering

1. Deploy new reference scripts (native script signature)
2. Update settings datum (native script signature)
3. Migrate MPT root handle to new script address (admin/policy key signature)

## Manual deployment steps

These are the underlying operations the automated plan performs. Use them only if the automated pipeline is unavailable.

### When updating the `minting_data` spending script

1. **Deploy new reference script** — Run `deploy` to get the new compiled CBOR. Attach it to the next `@handlecontract` subhandle.

2. **Migrate `handle_root@handle_settings`** — Spend from the old script address using the `UpdateMPT` redeemer (requires admin key). Send to the new script address with a recomputed MPT root hash in the inline datum.

3. **Update settings** — Rebuild the `demi@handle_settings` datum with the new `minting_data_script_hash` and `mint_governor`. Spend and re-lock with the updated datum.
