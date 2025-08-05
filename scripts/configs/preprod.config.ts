import { makeAddress } from "@helios-lang/ledger";

// ------- De-Mi contract config -------
// This will change smart contract compiled code

export const MINT_VERSION = 0n;
export const LEGACY_POLICY_ID =
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";
export const ADMIN_VERIFICATION_KEY_HASH =
  "4da965a049dfd15ed1ee19fba6e2974a0b79fc416dd1796a1f97f5e1";

// ------- End contract config -------

// ------- Settings Data  -------

// allowed minters' verification key hash
export const ALLOWED_MINTERS = [
  "976ec349c3a14f58959088e13e98f6cd5a1e8f27f6f3160b25e415ca",
];

// treasury address
export const TREASURY_ADDRESS = makeAddress(
  "addr_test1qq8phhe7z25df6g47sx8y83sh744qe6lpdzt8rnmklm80pvhz7gfc46pmx59ynx7tmcrcnw5j8l8jhglmugl6e7k3f0q30rg89"
);

// personalization script address
export const PZ_SCRIPT_ADDRESS = makeAddress(
  "addr_test1qq8phhe7z25df6g47sx8y83sh744qe6lpdzt8rnmklm80pvhz7gfc46pmx59ynx7tmcrcnw5j8l8jhglmugl6e7k3f0q30rg89"
);

// handle prices assets
// 1. kora@handle_prices
export const HANDLE_PRICES_ASSETS = [
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de1406b6f72614068616e646c655f707269636573",
];

// treasury fee percentage
export const TREASURY_FEE_PERCENTAGE = 10n;

// ------- End Settings Data -------
