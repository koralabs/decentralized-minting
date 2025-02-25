import {
  makeAddress,
  makeAssetClass,
  makeTxOutputId,
} from "@helios-lang/ledger";

// De-Mi contract config
export const MINT_VERSION = 0n;
export const GOD_VERIFICATION_KEY_HASH =
  "633a0061fcdb8aca5b86ef3a177fdcb0c178ccca3066b0be7197f3a1";

export const SETTINGS_ASSET_CLASS = makeAssetClass(
  // "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de14064656d694068616e646c655f73657474696e6773"
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de140676f6c646479646576"
);
export const SETTINGS_ASSET_TX_OUTPUT_ID = makeTxOutputId(
  "87c6979408b5bb053e52facf54d9464fe86cfc17bc35e5ce1fe5771c0eaa31bd#0"
);

export const MINTING_DATA_ASSET_CLASS = makeAssetClass(
  // "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de14068616e646c65735f726f6f744068616e646c655f73657474696e6773"
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de140746573745f676f6c646479"
);
export const MINTING_DATA_ASSET_TX_OUTPUT_ID = makeTxOutputId(
  "87c6979408b5bb053e52facf54d9464fe86cfc17bc35e5ce1fe5771c0eaa31bd#0"
);

// allowed minters' verification key hash
export const ALLOWED_MINTERS = [
  "8ba59b21136f2f0c84865fb017a5f67245660ff348d85c65c23a1411",
];
export const TREASURY_ADDRESS = makeAddress(
  "addr_test1qz96txepzdhj7ryyse0mq9a97eey2es07dydshr9cgapgyv06l2rv7x0p0vtg5kufwj3avaa909ex8uswsnxnad9ccqsyaga0j"
);

// personalization script address
export const PZ_SCRIPT_ADDRESS = makeAddress(
  "addr_test1qz96txepzdhj7ryyse0mq9a97eey2es07dydshr9cgapgyv06l2rv7x0p0vtg5kufwj3avaa909ex8uswsnxnad9ccqsyaga0j"
);

export const TREASURY_FEE = 2_000_000n;
export const MINTER_FEE = 2_000_000n;
