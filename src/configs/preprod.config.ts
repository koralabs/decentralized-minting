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
export const MINTING_DATA_ASSET_CLASS = makeAssetClass(
  // "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de14068616e646c65735f726f6f744068616e646c655f73657474696e6773"
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de140666972696e67646576"
);

// allowed minters' verification key hash
export const ALLOWED_MINTERS = [
  "0e1bdf3e12a8d4e915f40c721e30bfab50675f0b44b38e7bb7f67785", // test admin
];
export const TREASURY_ADDRESS = makeAddress(
  "addr_test1qq8phhe7z25df6g47sx8y83sh744qe6lpdzt8rnmklm80pvhz7gfc46pmx59ynx7tmcrcnw5j8l8jhglmugl6e7k3f0q30rg89" // test treasury
);

// personalization script address
export const PZ_SCRIPT_ADDRESS = makeAddress(
  "addr_test1qq8phhe7z25df6g47sx8y83sh744qe6lpdzt8rnmklm80pvhz7gfc46pmx59ynx7tmcrcnw5j8l8jhglmugl6e7k3f0q30rg89" // test
);

export const TREASURY_FEE = 2_000_000n;
export const MINTER_FEE = 2_000_000n;
export const PZ_UTXO_MIN_LOVELACE = 2_000_000n;

// NOTE:
// You can get these configs after publish
export const MINT_V1_SCRIPT_UTXO_ID = makeTxOutputId(
  "1c7c73c4628917e5120225a0865e2eb33c6ad289c63544f48932b9883fb7898f#0"
);
export const MINTINT_DATA_V1_SCRIPT_UTXO_ID = makeTxOutputId(
  "1c7c73c4628917e5120225a0865e2eb33c6ad289c63544f48932b9883fb7898f#1"
);

export const SETTINGS_ASSET_UTXO_ID = makeTxOutputId(
  "accfb94e834fc0e92fc429e3bacd98b95d221e706a880b7eda14c2f4ff28cc9b#0"
);
