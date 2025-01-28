import { SimpleWallet } from "@helios-lang/tx-utils";

import { WalletWithoutKey } from "../src";

const makeWalletWithoutKeyFromSimpleWallet = async (
  simpleWallet: SimpleWallet
): Promise<WalletWithoutKey> => {
  return {
    address: simpleWallet.address,
    utxos: await simpleWallet.utxos,
    collateralUtxo: (await simpleWallet.collateral)[0],
  };
};

export { makeWalletWithoutKeyFromSimpleWallet };
