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
  "633a0061fcdb8aca5b86ef3a177fdcb0c178ccca3066b0be7197f3a1";

export const SETTINGS_ASSET_CLASS = makeAssetClass(
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de14064656d694068616e646c655f73657474696e6773"
);

export const MINTING_DATA_ASSET_CLASS = makeAssetClass(
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de14068616e646c65735f726f6f744068616e646c655f73657474696e6773"
);

// allowed minters' verification key hash
export const ALLOWED_MINTERS = [
  "0e1bdf3e12a8d4e915f40c721e30bfab50675f0b44b38e7bb7f67785",
];
export const TREASURY_ADDRESS = makeAddress(
  "addr_test1qq8phhe7z25df6g47sx8y83sh744qe6lpdzt8rnmklm80pvhz7gfc46pmx59ynx7tmcrcnw5j8l8jhglmugl6e7k3f0q30rg89"
);

// personalization script address
export const PZ_SCRIPT_ADDRESS = makeAddress(
  "addr_test1qq8phhe7z25df6g47sx8y83sh744qe6lpdzt8rnmklm80pvhz7gfc46pmx59ynx7tmcrcnw5j8l8jhglmugl6e7k3f0q30rg89"
);

export const TREASURY_FEE = 2_000_000n;
export const MINTER_FEE = 2_000_000n;

// After when settings asset is deploy
// set tx output id
export const SETTINGS_ASSET_TX_OUTPUT_ID = makeTxOutputId(
  "71af22df6c91ccb67358056304de362335452740ffb5c05e4265ca1fe900d090#0"
);
