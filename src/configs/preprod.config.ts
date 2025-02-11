import { makeAddress, makeTxOutputId } from "@helios-lang/ledger";

// De-Mi contract configs
export const SETTINGS_UTF8_ASSET_NAME = "ADA Handle Settings";
export const INITIAL_TX_OUTPUT_ID = makeTxOutputId(
  "da03bdeb16f95fed276cd9611bb7dee66cd804f08cd3abab5625c8992b701378#1"
);

export const TREASURY_FEE = 1_000_000n;
export const MINTER_FEE = 1_000_000n;
// payment credentials who can mint
export const ALLOWED_MINTERS = [
  "4da965a049dfd15ed1ee19fba6e2974a0b79fc416dd1796a1f97f5e1", // Kora labs admin
];
export const TREASURY_ADDRESS = makeAddress(
  "addr_test1qq8phhe7z25df6g47sx8y83sh744qe6lpdzt8rnmklm80pvhz7gfc46pmx59ynx7tmcrcnw5j8l8jhglmugl6e7k3f0q30rg89"
);

// NOTE:
// configs you get after publish
export const MINT_V1_SCRIPT_UTXO_ID = makeTxOutputId(
  "9a3501235bd18f164c42e1958b13c5d8c866771632b4badb53c0953ed80fa5c1#1"
);
