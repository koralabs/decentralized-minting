import {
  makeAddress,
  makeAssetClass,
  makeTxOutputId,
} from "@helios-lang/ledger";

// De-Mi contract configs
export const SETTINGS_ASSET_CLASS = makeAssetClass(
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a000de140676f6c646479646576"
);

export const TREASURY_FEE = 1_000_000n;
export const MINTER_FEE = 1_000_000n;
// payment credentials who can mint
export const ALLOWED_MINTERS = [
  "4da965a049dfd15ed1ee19fba6e2974a0b79fc416dd1796a1f97f5e1", // Kora labs admin
];
export const TREASURY_ADDRESS = makeAddress(
  "addr_test1qz96txepzdhj7ryyse0mq9a97eey2es07dydshr9cgapgyv06l2rv7x0p0vtg5kufwj3avaa909ex8uswsnxnad9ccqsyaga0j"
);

// NOTE:
// configs you get after publish
export const MINT_V1_SCRIPT_UTXO_ID = makeTxOutputId(
  "9afbbd14e952aa709004ba900d1e5a771774f3c6c50e9dabbb1648555f161e35#1"
);
