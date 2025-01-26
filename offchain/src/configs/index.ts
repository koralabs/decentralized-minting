import { config as envConfig } from "dotenv";
envConfig();

export const {
  NETWORK = "preview",
  BLOCKFROST_API_KEY = "",
  MNEMONIC = "",
  KORA_USER_AGENT = "",
  HANDLE_ME_API_KEY = "",
} = process.env;
export const NETWORK_HOST =
  process.env.NETWORK?.toLocaleLowerCase() == "mainnet"
    ? ""
    : `${process.env.NETWORK?.toLowerCase()}.`;
export const HANDLE_API_ENDPOINT =
  process.env.HANDLE_API_ENDPOINT || `https://${NETWORK_HOST}api.handle.me`;

// constants for app
export const SETTINGS_UTF8_ASSET_NAME = "ADA Handle Settings";
export const REFERENCE_SCRIPT_UTXO_PATH = "references";
export const INITIAL_UTXO_PATH = "seed-utxo"; // file
export const MPF_STORE_PATH = "db"; // directory
