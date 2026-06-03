// WS1 — TypeScript port of the on-chain `label_set.ak` value encoding. The MPT value for a
// handle key is the canonical (sorted) concatenation of fixed 4-byte CIP-67 label prefixes,
// represented here as a lowercase hex string ("" = empty set). This MUST stay byte-identical
// to the aiken encoding so the off-chain `old_value`/`new_value` match what the validator
// reconstructs (`mpt.update` verifies the old bytes are in the trie).
//
// Trie note: the JS Merkle-Patricia-Forestry treats string values as UTF-8, so insert the
// value bytes via `Buffer.from(hex, "hex")` (see `valueBuffer`), not the hex string itself.

const LABEL_WIDTH_HEX = 8; // 4 bytes

const chunks = (set: string): string[] => {
  const out: string[] = [];
  for (let i = 0; i < set.length; i += LABEL_WIDTH_HEX) {
    out.push(set.slice(i, i + LABEL_WIDTH_HEX));
  }
  return out;
};

const normalizeLabel = (label: string): string => {
  const l = label.toLowerCase();
  if (l.length !== LABEL_WIDTH_HEX) {
    throw new Error(`label must be ${LABEL_WIDTH_HEX} hex chars (4 bytes): ${label}`);
  }
  return l;
};

/** Does the canonical label set contain `label`? */
export const contains = (set: string, label: string): boolean =>
  chunks(set.toLowerCase()).includes(normalizeLabel(label));

/** Insert `label`, keeping the set sorted ascending. Throws if already present. */
export const insert = (set: string, label: string): string => {
  const l = normalizeLabel(label);
  const cs = chunks(set.toLowerCase());
  if (cs.includes(l)) throw new Error("LABEL_ALREADY_PRESENT");
  cs.push(l);
  // fixed-width hex sorts lexicographically == on-chain byte order
  cs.sort();
  return cs.join("");
};

/** Remove `label`. Throws if absent. */
export const remove = (set: string, label: string): string => {
  const l = normalizeLabel(label);
  const cs = chunks(set.toLowerCase());
  const idx = cs.indexOf(l);
  if (idx < 0) throw new Error("LABEL_ABSENT");
  cs.splice(idx, 1);
  return cs.join("");
};

/** Apply a +1 (add) / -1 (remove) delta — couples the value change to the tx mint/burn. */
export const apply = (set: string, label: string, amount: bigint): string => {
  if (amount === 1n) return insert(set, label);
  if (amount === -1n) return remove(set, label);
  throw new Error("INVALID_AMOUNT");
};

/** The raw value bytes to store in the Trie (UTF-8-safe). */
export const valueBuffer = (set: string): Buffer => Buffer.from(set, "hex");

// CBOR unsigned-int hex (major type 0) — matches Plutus `serialise_data` of a small Int.
const cborUint = (n: bigint): string => {
  if (n < 24n) return n.toString(16).padStart(2, "0");
  if (n < 0x100n) return "18" + n.toString(16).padStart(2, "0");
  if (n < 0x10000n) return "19" + n.toString(16).padStart(4, "0");
  if (n < 0x100000000n) return "1a" + n.toString(16).padStart(8, "0");
  return "1b" + n.toString(16).padStart(16, "0");
};

/**
 * WS5 — the registry value (hex), byte-identical to on-chain `registry_value.encode(count, labels)`:
 *   count <= 0  -> labels (backward compatible with WS1)
 *   count  > 0  -> 0xff ++ CBOR(count) ++ labels
 */
export const encodeRegistryValue = (
  freeVirtualCount: bigint,
  labels: string,
): string => (freeVirtualCount <= 0n ? labels : "ff" + cborUint(freeVirtualCount) + labels);
