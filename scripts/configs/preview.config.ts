import {
  makeAddress,
  makeAssetClass,
  makeTxOutputId,
} from "@helios-lang/ledger";

// De-Mi contract config
export const MINT_VERSION = 0n;
export const LEGACY_POLICY_ID =
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";
export const GOD_VERIFICATION_KEY_HASH =
  "4da965a049dfd15ed1ee19fba6e2974a0b79fc416dd1796a1f97f5e1";

export const SETTINGS_ASSET_CLASS = makeAssetClass(
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de14064656d694068616e646c655f73657474696e6773"
);

export const MINTING_DATA_ASSET_CLASS = makeAssetClass(
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de14068616e646c65735f726f6f744068616e646c655f73657474696e6773"
);

// allowed minters' verification key hash
export const ALLOWED_MINTERS = [
  "4da965a049dfd15ed1ee19fba6e2974a0b79fc416dd1796a1f97f5e1",
];
export const TREASURY_ADDRESS = makeAddress(
  "addr_test1qz96txepzdhj7ryyse0mq9a97eey2es07dydshr9cgapgyv06l2rv7x0p0vtg5kufwj3avaa909ex8uswsnxnad9ccqsyaga0j"
);

// personalization script address
export const PZ_SCRIPT_ADDRESS = makeAddress(
  "addr_test1wzzctdyf9nkgrzqw6vxhaq8mpla7zhzjyjmk6txyu0wsgrgek9nj3"
);

export const TREASURY_FEE = 2_000_000n;
export const MINTER_FEE = 2_000_000n;

// After when settings asset is deploy
// set tx output id
export const SETTINGS_ASSET_TX_OUTPUT_ID = makeTxOutputId(
  "f83ba824a34a459d66907151ba3d9175f0b74af9e19bd51e12d482e4b07671e5#0"
);
