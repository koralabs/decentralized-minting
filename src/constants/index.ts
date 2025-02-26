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

export const LEGACY_POLICY_ID =
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";

/// (100) Reference Token Prefix
export const PREFIX_100 = "000643b0";

/// (222) Non-Fungible Token Prefix
export const PREFIX_222 = "000de140";

/// (333) Fungible Token Prefix
export const PREFIX_333 = "0014df10";

/// (444) Rich-Fungible Token Prefix
export const PREFIX_444 = "001bc280";

export const PZ_UTXO_MIN_LOVELACE = 2_000_000n;

// Contract names
export const CONTRACT_NAMES = [
  "mint_proxy.mint",
  "mint_v1.withdraw",
  "minting_data_proxy.spend",
  "minting_data_v1.withdraw",
  "orders.spend",
];
