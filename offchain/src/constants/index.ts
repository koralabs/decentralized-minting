import { config as envConfig } from "dotenv";
envConfig({ path: `.env.${process.env.NODE_ENV || "development"}.local` });

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
