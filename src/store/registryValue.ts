// TypeScript port of the on-chain `registry_value.ak`. The MPT value at a ROOT handle key carries
// the WS1 label set. This MUST stay byte-identical to the aiken `encode` so the off-chain
// `old_value`/`new_value` match what the validator reconstructs (`mpt.update` verifies the old
// bytes are in the trie).
//
// Representation: labels are a lowercase hex string of concatenated 4-byte CIP-67 prefixes (each
// starting 0x00); `encode` returns that hex string ("" = empty value).

/**
 * Byte-identical to on-chain `registry_value.encode(labels)` — the value is exactly the label set.
 */
export const encode = (labels: string): string => labels.toLowerCase();
