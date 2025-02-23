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

/// (100) Reference Token Prefix
export const PREFIX_100 = "000643b0";

/// (222) Non-Fungible Token Prefix
export const PREFIX_222 = "000de140";

/// (333) Fungible Token Prefix
export const PREFIX_333 = "0014df10";

/// (444) Rich-Fungible Token Prefix
export const PREFIX_444 = "001bc280";
