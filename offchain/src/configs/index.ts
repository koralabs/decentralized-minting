import { NetworkName } from "@helios-lang/tx-utils";

import * as PREPROD_CONFIGS from "./preprod.config.js";
import * as PREVIEW_CONFIGS from "./preview.config.js";

const GET_CONFIGS = (network: NetworkName) => {
  if (network == "mainnet") throw new Error("Mainnet not configured yet");
  if (network == "preprod") return PREPROD_CONFIGS;
  return PREVIEW_CONFIGS;
};

export { GET_CONFIGS };
