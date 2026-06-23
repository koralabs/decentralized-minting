// WS1 label registry value. The registry value at a ROOT handle key carries the WS1 label set
// (the concatenated 4-byte CIP-67 label prefixes the root currently holds, e.g. 001 settings).
//
// The contract only ever *encodes* a value from the structured label set — it never parses raw
// value bytes (the off-chain engine tracks the label set and supplies it; `mpt.update`'s proof
// verifies the reconstructed old bytes are actually in the trie). An empty handle stays `#""`.
pub fn encode(labels: ByteArray) -> ByteArray {
  labels
}
