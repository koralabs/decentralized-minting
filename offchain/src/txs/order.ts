import {
  makeInlineTxOutputDatum,
  makeValue,
  TxOutputId,
} from "@helios-lang/ledger";
import { makeTxBuilder, SimpleWallet } from "@helios-lang/tx-utils";

import {
  buildContractsConfig,
  buildOrderData,
  makeSignatureMultiSigScriptData,
  OrderDatum,
} from "../contracts/index.js";
import { BuildTx, mayFailTransaction } from "../helpers/index.js";

const requestHandle = (
  initialTxOutputId: TxOutputId,
  handleName: string
): BuildTx => {
  return async (wallet: SimpleWallet) => {
    // check handle is minted or not
    const address = wallet.address;
    const spareUtxos = await wallet.utxos;
    const contractsConfig = buildContractsConfig(initialTxOutputId);

    const order: OrderDatum = {
      destination: {
        address,
        datum: undefined,
      },
      owner: makeSignatureMultiSigScriptData(address.spendingCredential),
      requested_handle: Buffer.from(handleName).toString("hex"),
    };

    // start building tx
    const txBuilder = makeTxBuilder({
      isMainnet: await wallet.isMainnet(),
    });

    // <-- lock order
    txBuilder.payUnsafe(
      contractsConfig.order.orderScriptAddress,
      makeValue(5_000_000n),
      makeInlineTxOutputDatum(buildOrderData(order))
    );

    const txResult = await mayFailTransaction(
      txBuilder,
      address,
      spareUtxos
    ).complete();
    return txResult;
  };
};

export { requestHandle };
