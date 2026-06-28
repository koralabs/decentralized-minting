# Manual Contract Deploy Runbook (decentralized-minting)

> **The GitHub Actions "Deployment Plan" workflow is OUT OF DATE. Do NOT use it.**
> Contract deploys are run **manually** from this repo, output unsigned CBOR, and are
> **signed by the operator in Eternl** (multisig). This file is the canonical process —
> stop rediscovering it.

## One-shot (preview)

```bash
cd decentralized-minting

# 1. preview Blockfrost key — read it off the running preview box engine container
KEY=$(ssh kora-sf 'for c in $(sudo docker ps -q); do \
  k=$(sudo docker inspect -f "{{range .Config.Env}}{{println .}}{{end}}" "$c" | sed -n "s/^BLOCKFROST_API_KEY=//p" | head -1); \
  case "$k" in preview*) echo "$k"; break;; esac; done')

# 2. preview handlecontract native script (1-of-2 ScriptAny; keys 5b468ea6 / d9980af9).
#    REQUIRED — without it Eternl errors "Multi-Sig wallet can't sign; the native script
#    should be added at build." This is public on-chain data (key hashes), not a secret.
NS=8202828200581c5b468ea6affe46ae95b2f39e8aaf9141c17f1beb7f575ba818cf1a8b8200581cd9980af92828f622d9c9f0a6e89a61da55829ac0dbd11127bc62916d

# 3. generate the unsigned bundle
BLOCKFROST_API_KEY="$KEY" HANDLECONTRACT_NATIVE_SCRIPT_CBOR="$NS" KORA_USER_AGENT=kora-backend-request/1.0 \
  NETWORK=preview npx tsx scripts/generateDeploymentPlan.ts \
  --desired deploy/preview/decentralized-minting.yaml \
  --artifacts-dir /tmp/decentralized-minting-plan
```

Output: `/tmp/decentralized-minting-plan/tx-01.cbor.hex` (+ `tx-02`, …) + `summary.md`.

## Sign (operator)

Import each `tx-NN.cbor` into **Eternl** in **manifest order** (tx-01 first; wait for it to
land on-chain, then tx-02; …). Confirm outputs match `summary.md`, sign, submit. K.O.R.A.
posts convergence. Never sign chained txs out of order.

## Per-network `HANDLECONTRACT_NATIVE_SCRIPT_CBOR`
- **preview** = 1-of-2 ScriptAny (above).
- **preprod / mainnet** = 3-of-3 (ScriptAll wrapping ScriptAny groups) — *different* CBOR per
  network. Source the value the same way it was sourced before: it's the GitHub Actions var
  `HANDLECONTRACT_NATIVE_SCRIPT_CBOR_<NET>` (not always readable), recoverable from prior
  Claude Code session transcripts (`grep -r HANDLECONTRACT_NATIVE_SCRIPT_CBOR ~/.claude/projects/*/*.jsonl`),
  or from the live on-chain handlecontract address. Only the payment-credential script (pair 0)
  goes in the var; Eternl reconstructs the full credential-pair array.

## Hard rules / gotchas (each one cost a session)
- **Native script MUST be attached** (env var above) or Eternl can't sign. This is the #1 repeat failure.
- **The mint-proxy (`demimntprx`) is FROZEN** at aiken v1.0.29 / policy `6c32db33`. NEVER recompile it.
  If a commit recompiled it (drifts the policy to e.g. `714c946c`), restore
  `smart-contract-mint-proxy/plutus.json` from the frozen commit (`f1acd3a`) before regenerating blueprints.
- **After any `.ak` change**, rebuild the SDK blueprints before generating the plan:
  ```bash
  cd smart-contract && aiken build && cp plutus.json /tmp/main-opt.json
  aiken build -t verbose && cp plutus.json /tmp/main-unopt.json && aiken build   # restore optimized
  cd .. && npx tsx scripts/generateBlueprints.ts \
    --main-optimized /tmp/main-opt.json --main-unoptimized /tmp/main-unopt.json \
    --proxy-optimized smart-contract-mint-proxy/plutus.json --proxy-unoptimized smart-contract-mint-proxy/plutus.json
  ```
  Then update the changed hash(es) in `deploy/<net>/decentralized-minting.yaml`.
- Deployment txs are **self-contained at the native-script address** (inputs + change there). A separate
  deployer wallet would need two independent signatures, which Eternl's multisig can't do in one flow.
- `tx_artifact_generated=false` / "Skipping … 404" in the summary = informational; not a signable tx.

## Full background
`adahandle-deployments/docs/{contract-deployment-runbook,demi-mainnet-cutover}.md` (note: the
*workflow* parts are stale; the Eternl-signing + Lessons-Learned parts still apply).
