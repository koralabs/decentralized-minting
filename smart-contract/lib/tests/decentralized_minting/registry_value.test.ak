use decentralized_minting/registry_value.{encode}

// --- encode: labels-only registry value ---

test encode_empty_is_empty() {
  // no labels -> empty value (existing handles unchanged)
  encode(#"") == #""
}

test encode_is_pure_labels() {
  // the value is exactly the label set
  encode(#"00001070000020e0") == #"00001070000020e0"
}

test encode_is_identity() {
  encode(#"00001070") == #"00001070"
}
