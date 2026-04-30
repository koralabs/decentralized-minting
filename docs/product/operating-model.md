# Operating Model

## Why This Repo Exists

`decentralized-minting` sits at the seam between three types of state that must agree with each other:
- immutable validator source in `smart-contract/`,
- deterministic off-chain builders in `src/`,
- the desired network-specific rollout state committed under `deploy/`.

The operating model of the repo is built around keeping those three layers synchronized. The Aiken source establishes what the validators should do. The TypeScript package translates that into hashes, datum CBOR, and unsigned transaction plans. The desired-state YAML records what Kora intends to have live on each network. Operational safety depends on reviewing any mismatch between those layers before a transaction is signed.

## Core Loops

### 1. Maintain Desired State

The first operational loop is configuration ownership. Engineers update `deploy/<network>/decentralized-minting.yaml` when:
- a contract parameter changes,
- the set of comparable settings values changes,
- a rollout needs to point at different settings values,
- a new migration rule or ignored settings path becomes necessary.

This YAML is not a dump of chain state. It is the policy statement for what De-Mi should look like after deployment converges. That is why the parser rejects observed-only fields such as live tx hashes or live UTxO refs. If a value belongs only to a specific deployment event, it should appear in generated artifacts, not in the committed desired-state file.

### 2. Build and Compare

The second loop is deterministic comparison. `scripts/generateDeploymentPlan.ts` loads the desired YAML, rebuilds expected contract hashes from source, fetches live scripts and settings handles, and computes the delta. The result is not merely "changed" or "unchanged". Each contract is classified into one of four drift states:
- `no_change`,
- `script_hash_only`,
- `settings_only`,
- `script_hash_and_settings`.

That distinction drives the operator response. A script-hash drift means the rollout needs a new reference-script deployment. A settings-only drift means the settings handle can be updated without changing the validator hash. A combined drift signals that both the reference script and the comparable settings must move together.

### 3. Generate Unsigned Artifacts

Once the drift is known, the planner can generate unsigned transaction artifacts if the required external inputs are available. These artifacts are intentionally unsigned. They are the last safe boundary before funds, policy authority, or settings ownership are exercised.

The planner may emit several tx classes:
- reference-script deployment txs that place a new validator at the appropriate script address,
- a settings update tx that rebuilds `demi@handle_settings` using the newly expected script hashes,
- a preparation tx when the admin address needs additional ADA before an MPT migration,
- an MPT root migration tx when `handle_root@handle_settings` must move to a new validator address.

Artifact generation is sensitive to protocol limits. The code estimates signed tx size before saving artifacts and fails if the projected transaction would exceed the chain maximum.

### 4. Human Review and Signing

The repo stops before submission. This is not a missing feature. Human review is part of the product design because the resulting transactions can:
- update contract ownership handles,
- change the mint-governor relationship,
- move the root-handle settings UTxO to a new validator,
- consume script-controlled ADA to pay fees.

The operational expectation is that an engineer or authorized operator reviews the markdown summary, inspects the unsigned artifacts, signs them with the appropriate wallet or native script authority, and only then submits them to the network.

### 5. Post-Deploy Verification

After submission, the operator's job is not done. The live chain state must converge to the desired YAML plus any explicitly expected runtime allocation such as a newly minted `@handlecontract` subhandle. If the newly deployed reference script exists but the settings datum still points to the old hash, the rollout is incomplete. If `handle_root@handle_settings` still resides at the old validator address after a minting-data upgrade, the deployment is incomplete. The repo's operating model assumes those stale half-rollouts are first-class failure modes.

## Minting Workflow Model

Deployment planning is only one half of the repo. The other half is minting preparation.

### New-Handle Minting

New-handle minting starts from order UTxOs, not arbitrary handle names. The SDK provides helpers to:
- derive the order output data required to request a handle,
- fetch current order UTxOs from the orders script address,
- reject malformed or underfunded orders,
- build a `TxPlan` that spends the minting-data UTxO, relocks updated settings data, updates handle-price info, and routes fees correctly,
- finalize the result into unsigned transaction CBOR with properly computed Plutus script data hash behavior.

The repo treats the trie root as the gate before any of that work is considered valid. If the local trie hash does not equal the on-chain `mpt_root_hash`, the mint builder exits before constructing the transaction.

### Legacy Migration Minting

Legacy migration follows the same philosophy with a slightly different surface. The caller supplies the legacy handles to insert. The repo:
- fetches the live minting-data datum,
- verifies the current trie root,
- inserts the handles into the local trie,
- builds the legacy proof structure required by the validator,
- returns a partial transaction plan that can later be extended or finalized by the caller.

This keeps migration logic deterministic while still separating the repo's job from the external sign-and-submit step.

### Trie State Discipline

The trie store is local mutable state, which means it is both necessary and dangerous. The operating model assumes:
- the trie store is treated as an operator-controlled working database,
- a failed or abandoned mint attempt may require reloading or reconstructing the trie before retrying,
- no caller should silently ignore a root mismatch,
- the chain datum remains the authoritative public commitment and the local trie is the authoritative proof generator only when it matches that commitment.

## Trust Boundaries

Three dependencies define the repo's trust model.

### Handle API

The Handle API answers questions such as:
- which handle owns a given UTxO,
- what datum is attached to a settings handle,
- what validator hash is currently live for a given De-Mi script type,
- what script CBOR is associated with a deployed handle.

Because Handle API requests are part of operational truth, the repo requires a real `User-Agent` and, for authenticated paths, the Handle API key. This is both an operational rule and a debugging aid: if those headers are missing, the resulting behavior is not considered trustworthy.

### Blockfrost

Blockfrost provides:
- protocol parameters for fee estimation and tx sizing,
- network-specific UTxO lookups,
- a consistent way to infer the target network from the configured project key prefix.

The repo assumes Blockfrost answers are the authoritative transaction-building context. If Blockfrost is unavailable, deployment tx generation and most finalized mint builders should be treated as blocked rather than partially functional.

### Local Filesystem

The filesystem holds:
- desired-state YAML,
- generated deployment artifacts,
- point-in-time coverage reports,
- optional trie store directories supplied by callers.

Only desired state is canonical source. Generated artifacts and coverage reports are derived outputs and may be stale if they are not regenerated.

## Failure Modes the Docs Must Surface

The repo is easier to misuse when documentation hides sharp edges. The current docs should make these cases explicit:
- `main` may be named `master` in source control even when external automation assumes `main`.
- older docs and historical scripts may refer to an interactive CLI that is not present on the current branch.
- settings drift and script-hash drift can coexist and require separate tx classes.
- native-script tx fee estimation needs an explicit safety margin because witness overhead is otherwise underestimated.
- MPT migration may require an additional preparation tx to fund the admin signer before the root-handle migration itself can succeed.

These are not trivia. They are the main reasons a rollout that looks straightforward on paper fails when executed against live chain state.

## Readiness Standard for Future Changes

Documentation for this repo should be considered ready only when it helps an unfamiliar but competent engineer answer all of the following without reading the full codebase first:
- What is the product boundary of this repo?
- Which steps are automated and which remain manual by design?
- Which files declare the desired on-chain state?
- How are script-hash drift and settings drift detected?
- What has to be true before a mint transaction is considered safe to build?
- Which external systems does the repo rely on?

If the docs cannot answer those questions, the repo is not operationally ready even if the source compiles.
