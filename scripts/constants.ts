import { NetworkName } from "@helios-lang/tx-utils";
import path from "path";

export const { STORE_DIRECTORY = "" } = process.env;

// De Mi Constants
export const MPT_STORE_PATH = (network: NetworkName): string =>
  path.join(STORE_DIRECTORY, network.toLowerCase() + "-db"); // directory
