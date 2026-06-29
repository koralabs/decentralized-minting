# preprod DeMi deploy artifacts

Contract CBORs (`*.unoptimized.cbor`) + `decentralized-minting.yaml` (build
params: hashes, governor, treasury, settings) for the preprod DeMi deploy.

The cutover **plan** and the new-session **driver prompt** live in the repo the
cutover is run from (`handle.me` — the live-cip30 suite, BFF, and box deploy are
there):

- `handle.me/tasks/DEMI_PREPROD_CUTOVER.md` — the runbook + "Box cutover log"
- `handle.me/tasks/DEMI_PREPROD_CUTOVER_PROMPT.md` — paste into a fresh session
