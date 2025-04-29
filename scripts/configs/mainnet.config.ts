import { makeAddress } from "@helios-lang/ledger";

// ------- De-Mi contract config -------
// This will change smart contract compiled code
export const MINT_VERSION = 0n;
export const LEGACY_POLICY_ID =
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";
export const GOD_VERIFICATION_KEY_HASH =
  "4da965a049dfd15ed1ee19fba6e2974a0b79fc416dd1796a1f97f5e1";
// ------- End contract config -------

// ------- Settings Data -------
// allowed minters' verification key hash
export const ALLOWED_MINTERS = [
  "976ec349c3a14f58959088e13e98f6cd5a1e8f27f6f3160b25e415ca",
];
export const TREASURY_ADDRESS = makeAddress(
  "addr1xylxvryvzxddvl6jjeyjut2kmyhaf5pjmc933z74gmenk2e7vcxgcyv66el499jf9ck4dkf06ngr9hstrz9a23hn8v4sc89s5z"
);

// personalization script address
export const PZ_SCRIPT_ADDRESS = makeAddress(
  "addr1wxktka03n943759y4pcexpmftdhzsrrv8kcd2qs8cwgtdhgg6j4ux"
);

export const HANDLE_PRICES_ASSETS = [
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de1406b6f72614068616e646c655f707269636573",
];

export const TREASURY_FEE_PERCENTAGE = 10n;

// ------- End Settings Data -------
