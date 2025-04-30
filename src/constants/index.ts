import { config } from "dotenv";
config({ path: `.env.${process.env.NODE_ENV || "development"}.local` });

export const {
  NODE_ENV = "",
  NETWORK = "",
  BLOCKFROST_API_KEY = "",
  KORA_USER_AGENT = "",
  HANDLE_ME_API_KEY = "",
} = process.env;
export const NETWORK_HOST =
  process.env.NETWORK?.toLocaleLowerCase() == "mainnet"
    ? ""
    : `${process.env.NETWORK?.toLowerCase()}.`;
export const HANDLE_API_ENDPOINT =
  process.env.HANDLE_API_ENDPOINT || `https://${NETWORK_HOST}api.handle.me`;

/// (100) Reference Token Prefix
export const PREFIX_100 = "000643b0";

/// (222) Non-Fungible Token Prefix
export const PREFIX_222 = "000de140";

/// (333) Fungible Token Prefix
export const PREFIX_333 = "0014df10";

/// (444) Rich-Fungible Token Prefix
export const PREFIX_444 = "001bc280";

/// (000) Virtual Sub Handle Prefix
export const PREFIX_000 = "00000000";

/// (001) Root Handle Settings Prefix
export const PREFIX_001 = "00001070";

export const MIN_TREASURY_FEE = 2_000_000n;
export const MIN_MINTER_FEE = 2_000_000n;

// Contract names
export const CONTRACT_NAMES = [
  "mint_proxy.mint",
  "mint_v1.withdraw",
  "minting_data.spend",
  "orders.spend",
];

export const LEGACY_POLICY_ID =
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";

export const SETTINGS_HANDLE_NAME = "demi@handle_settings";
export const MINTING_DATA_HANDLE_NAME = "handle_root@handle_settings";
export const HANDLE_PRICE_INFO_HANDLE_NAME = "kora@handle_prices";
