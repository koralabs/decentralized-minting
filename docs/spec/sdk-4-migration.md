# SDK 4: label-aware registry trie migration

Version 4.0.0 changes `buildTrie` and `fillHandles` from `string[]` to
`readonly HandleRegistryEntry[]`. This is an explicit major API change.
A names-only overload cannot reconstruct a labeled on-chain registry root.
JavaScript callers receive a descriptive rejection instead of an implicit
empty label set. Transaction builder signatures and deep import paths remain
available through exports mapped to `lib/`. Both the source workspace manifest
and packed artifact resolve the public root to `lib/index.js` and
`lib/index.d.ts`. Run `npm run build` before using a `file:` workspace link;
import the package root, not private `lib/store` paths.

```ts
import { buildTrie, fillHandles, type HandleRegistryEntry } from
  "@koralabs/handles-decentralized-minting";

const handles: HandleRegistryEntry[] = [
  { name: "alice", labels: "00001070000020e0" },
  { name: "bob", labels: "" },
];
const trie = await buildTrie(handles);
const incremental = await buildTrie([]);
await fillHandles(incremental, handles, () => {});
```

These names and values illustrate the encoding, not a live registry snapshot.
Each value is raw bytes of a sorted, unique set of four-byte labels, as defined
by `smart-contract/lib/decentralized_minting/label_set.ak` and
`registry_value.ak`. Empty string means a known empty set. Uppercase hex is
normalized to lowercase without changing bytes. Missing/null labels, malformed
hex, incomplete labels, duplicates and unsorted sets reject. Labels are not
silently sorted or discarded. The contract does not whitelist label IDs or
require a `00` prefix. Names must be nonempty strings and unique within the batch.

Both helpers validate the entire batch before trie construction or insertion.
`fillHandles` reports progress after each successful insert. Validation errors
leave it untouched; subsequent insertion failures (for example a duplicate
handle key) can leave earlier successful inserts in place, so prefer a fresh
`buildTrie` for the complete snapshot.

## Sourcing and root verification

Fetch all names through paginated `/handles` requests with `Accept: text/plain`.
Fetch `/mpt-root/registry-labels` successfully and validate its response before
joining the two datasets. The tracked API contract returns
`{ network, current_root, count, labels }`; `labels` is a sparse map containing
nonempty label sets only. After validating that map, an absent own key means
`labels: ""`. Use an own-property lookup to support names such as `constructor`.
A failed request, malformed map or unknown label set must abort reconstruction.
Do not default an unavailable map to `{}` or reconstruct from names alone.

Deduplicate paginated names and reject labeled keys absent from the name set.
Check the response network and count. Separate requests are not an atomic
snapshot: compare the computed trie root with the API's `current_root` and the
on-chain minting-data root before using any proof. A mismatch aborts the
operation; neither a disk cache nor a hard-coded label patch is a fallback.
`buildTrie` validates and constructs supplied entries; it does not fetch or
verify a network root on the caller's behalf.

## Dependent migration

Review equivalent `Trie.fromList(... value: "")` builders as well as direct
helper calls. The recovered `kora-secrets-protocol` registry builder requires
the label-map join and root verification. Its `secrets.handle.me` guardian
script must stop patching a hard-coded labeled-handle list after that fix.
The minting engine uses its own label-aware builder and currently vendors SDK
3.0.2 for transaction helpers; this helper migration alone does not require
upgrading that vendor dependency.

For consumers migrating to this release, update the package reference and its
lock metadata together, then validate the actual packed artifact. Do not run
wallet-signing or transaction-submission scripts as migration tests. Publication
is a separate operation; preparing this release does not publish it.

## Package verification

From the SDK checkout, install the locked dependencies, run `npm run build`,
then run `npm run validate:sdk-package`.
It compiles into a private temporary directory, packs the same `lib/`
layout used by publication, extracts the tarball into an isolated consumer,
checks packed and workspace public types and deep imports, and verifies real trie roots, proofs and
runtime rejections. It needs no registry, wallet, API credentials or network.
The script retains its generated artifacts and prints their directory.
