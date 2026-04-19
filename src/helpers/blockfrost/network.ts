import type { NetworkName } from "../cardano-sdk/networkName.js";

const getNetwork = (apiKey: string): NetworkName => {
  const network = apiKey.substring(0, 7);

  if (network !== "mainnet" && network !== "preview" && network !== "preprod") {
    throw new Error(`Unknown network ${network}`);
  }

  return network;
};

export { getNetwork };
