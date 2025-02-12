import {
  makeAddress,
  makeAssetClass,
  makeTxOutputId,
} from "@helios-lang/ledger";

// De-Mi contract config
export const SETTINGS_ASSET_CLASS = makeAssetClass(
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de140676f6c646479646576"
);

export const TREASURY_FEE = 1_000_000n;
export const MINTER_FEE = 1_000_000n;
// payment credentials who can mint
export const ALLOWED_MINTERS = [
  "8ba59b21136f2f0c84865fb017a5f67245660ff348d85c65c23a1411", // test admin
  "4da965a049dfd15ed1ee19fba6e2974a0b79fc416dd1796a1f97f5e1", // Kora labs admin
];
export const TREASURY_ADDRESS = makeAddress(
  "addr_test1qz96txepzdhj7ryyse0mq9a97eey2es07dydshr9cgapgyv06l2rv7x0p0vtg5kufwj3avaa909ex8uswsnxnad9ccqsyaga0j"
);

// NOTE:
// configs you get after publish
export const MINT_V1_SCRIPT_UTXO_ID = makeTxOutputId(
  "f66d4120ca2dd5cc79ce0a26b69f5d8d1ee76725afdbe2a09df05abe7eb2cee4#1"
);
