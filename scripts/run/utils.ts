import {
  makeBlockfrostV0Client,
  makeSimpleWallet,
  NetworkName,
  restoreRootPrivateKey,
  SimpleWallet,
} from "@helios-lang/tx-utils";
import prompts from "prompts";

import { BLOCKFROST_API_KEY, NETWORK } from "../../src/constants/index.js";

const makeWalletFromCLI = async (message: string): Promise<SimpleWallet> => {
  const { seed } = await prompts({
    message,
    name: "seed",
    type: "password",
  });
  return makeSimpleWallet(
    restoreRootPrivateKey(seed.split(" ")),
    makeBlockfrostV0Client(NETWORK as NetworkName, BLOCKFROST_API_KEY)
  );
};

export { makeWalletFromCLI };
