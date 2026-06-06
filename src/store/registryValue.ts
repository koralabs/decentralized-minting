// DSH-402 — TypeScript port of the on-chain `registry_value.ak`. The MPT value at a ROOT
// handle key carries, alongside the WS1 label set, the SET OF NAMES of the root's currently-held
// FREE private virtual subs (at most `free_virtual_count`). This MUST stay byte-identical to the
// aiken `encode` so the off-chain `old_value`/`new_value` match what the validator reconstructs
// (`mpt.update` verifies the old bytes are in the trie). If these diverge, every free-virtual
// `mpt.update` fails on-chain.
//
// Representation: free names and labels are lowercase hex strings; `encode` returns a hex string
// ("" = empty value). Names are sub-handle name bytes; labels are concatenated 4-byte CIP-67
// prefixes (each starting 0x00), so a leading 0xff marker can never collide with a label set.
//
// Encoding (mirrors `registry_value.ak`):
//   - free_names == []  ->  labels                                  (backward compatible with WS1)
//   - free_names != []  ->  0xff ++ serialise_data(free_names) ++ labels
// where serialise_data(free_names) is the Plutus `Data` CBOR of a `List<ByteArray>` — confirmed
// byte-identical against aiken v1.0.29 `builtin.serialise_data`:
//   - non-empty list:  0x9f ++ (each element) ++ 0xff   (indefinite-length array)
//   - byte string len < 24:   (0x40 | len) ++ bytes
//   - byte string 24..64:     0x58 ++ len(1 byte) ++ bytes
//   - empty list:      0x80   (never reached by `encode`, which short-circuits on [])

// CBOR header for a Plutus `Data` byte string (major type 2). Handle/sub names are CIP-67 asset
// names (<= 32 bytes), so a single definite-length chunk always suffices; Plutus only chunks
// byte strings longer than 64 bytes, which a valid handle name can never be — throw rather than
// emit divergent bytes for an impossible input.
const cborByteString = (hex: string): string => {
  const byteLen = hex.length / 2;
  if (!Number.isInteger(byteLen)) {
    throw new Error(`free name is not valid hex (odd length): ${hex}`);
  }
  if (byteLen < 24) return (0x40 | byteLen).toString(16).padStart(2, "0") + hex;
  if (byteLen <= 64) return "58" + byteLen.toString(16).padStart(2, "0") + hex;
  throw new Error(`free name exceeds 64 bytes (Plutus would chunk): ${hex}`);
};

// Plutus `Data` CBOR of a non-empty `List<ByteArray>` (indefinite-length array).
const serialiseData = (freeNames: string[]): string =>
  "9f" + freeNames.map((n) => cborByteString(n.toLowerCase())).join("") + "ff";

/**
 * Byte-identical to on-chain `registry_value.encode(free_names, labels)`.
 *   free_names == []  -> labels (an empty handle stays "", any pure-label handle is WS1-identical)
 *   free_names != []  -> "ff" ++ serialise_data(free_names) ++ labels
 */
export const encode = (freeNames: string[], labels: string): string => {
  const l = labels.toLowerCase();
  return freeNames.length === 0 ? l : "ff" + serialiseData(freeNames) + l;
};

/** A free slot is available iff the root holds fewer than the configured free count. */
export const hasFreeSlot = (freeNames: string[], freeVirtualCount: number): boolean =>
  freeNames.length < freeVirtualCount;

/** Is this sub-name one of the root's current free names? */
export const hasFreeName = (freeNames: string[], name: string): boolean =>
  freeNames.map((n) => n.toLowerCase()).includes(name.toLowerCase());

/**
 * Add a sub-name to the free set (a free private-virtual MINT). Prepends (mirrors aiken
 * `list.push`) and is idempotent — the prepend order is part of the encoded bytes, so it MUST
 * match the contract's `add_free_name`.
 */
export const addFreeName = (freeNames: string[], name: string): string[] => {
  const n = name.toLowerCase();
  const lower = freeNames.map((x) => x.toLowerCase());
  return lower.includes(n) ? lower : [n, ...lower];
};

/**
 * Remove a sub-name from the free set (a free private-virtual BURN → reopen its slot). No-op if
 * the name isn't in the set (a paid sub's burn doesn't touch the allowance). Preserves order.
 */
export const removeFreeName = (freeNames: string[], name: string): string[] => {
  const n = name.toLowerCase();
  return freeNames.map((x) => x.toLowerCase()).filter((x) => x !== n);
};
