import { makeAddress } from "@helios-lang/ledger";

import { getBlockfrostV0Client } from "../helpers/index.js";
import { WalletWithoutKey } from "./types.js";

const makeWalletWithoutKeyFromAddress = async (
  bech32Address: string,
  blockfrostApiKey: string
): Promise<WalletWithoutKey> => {
  const address = makeAddress(bech32Address);
  const blockfrostV0Client = getBlockfrostV0Client(blockfrostApiKey);
  const utxos = await blockfrostV0Client.getUtxos(address);

  return {
    address,
    utxos,
  };
};

export { makeWalletWithoutKeyFromAddress };
