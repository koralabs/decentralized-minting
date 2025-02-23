import {
  makeAddress,
  makeAssetClass,
  makeTxOutputId,
} from "@helios-lang/ledger";

// De-Mi contract config
export const MINT_VERSION = 0n;

export const SETTINGS_ASSET_CLASS = makeAssetClass(
  // "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de14064656d694068616e646c655f73657474696e6773"
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de140676f6c646479646576"
);
export const MINTING_DATA_ASSET_CLASS = makeAssetClass(
  // "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de14068616e646c65735f726f6f744068616e646c655f73657474696e6773"
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de140666972696e67646576"
);

// payment credentials who can mint
export const ALLOWED_MINTERS = [
  "8ba59b21136f2f0c84865fb017a5f67245660ff348d85c65c23a1411", // test admin
];
export const TREASURY_ADDRESS = makeAddress(
  "addr_test1qz96txepzdhj7ryyse0mq9a97eey2es07dydshr9cgapgyv06l2rv7x0p0vtg5kufwj3avaa909ex8uswsnxnad9ccqsyaga0j"
);

// personalization script address
export const PZ_SCRIPT_ADDRESS = makeAddress(
  "addr_test1qz96txepzdhj7ryyse0mq9a97eey2es07dydshr9cgapgyv06l2rv7x0p0vtg5kufwj3avaa909ex8uswsnxnad9ccqsyaga0j" // test
);

export const TREASURY_FEE = 2_000_000n;
export const MINTER_FEE = 2_000_000n;
export const PZ_UTXO_MIN_LOVELACE = 2_000_000n;

// NOTE:
// You can get these configs after publish
export const SETTINGS_ASSET_UTXO_ID = makeTxOutputId(
  "9a3501235bd18f164c42e1958b13c5d8c866771632b4badb53c0953ed80fa5c1#1"
);

export const MINT_V1_SCRIPT_UTXO_ID = makeTxOutputId(
  "9a3501235bd18f164c42e1958b13c5d8c866771632b4badb53c0953ed80fa5c1#1"
);
export const MINTINT_DATA_V1_SCRIPT_UTXO_ID = makeTxOutputId(
  "9a3501235bd18f164c42e1958b13c5d8c866771632b4badb53c0953ed80fa5c1#1"
);
