import { bytesToHex } from "@helios-lang/codec-utils";
import { SimpleWallet } from "@helios-lang/tx-utils";
import prompts from "prompts";
import { Result } from "ts-res";

import { BuildTxError, TxSuccessResult } from "../src/helpers/index.js";

type BuildTx = () => Promise<Result<TxSuccessResult, Error | BuildTxError>>;

const handleTx = async (wallet: SimpleWallet, buildTx: BuildTx) => {
  const txResult = await buildTx();
  if (!txResult.ok) {
    console.error("\nTransaction Build Error:\n");
    console.error(txResult.error.message);
    console.log("\n");
    throw txResult.error;
  }

  let { tx } = txResult.data;
  const { dump } = txResult.data;
  let finished = false;
  let submitted = false;

  while (!finished) {
    const signed = tx.witnesses.signatures.length > 0;
    const txAction = await prompts({
      message: "Transaction built! What would you like to do next?",
      name: "action",
      type: "select",
      choices: [
        {
          title: "print",
          description: "Print out the raw CBOR of the transaction",
          value: () => {
            console.log({ cbor: bytesToHex(tx.toCbor()), dump });
          },
        },
        {
          title: "tx-id",
          description: "Print the transaction ID",
          value: () => {
            console.log(bytesToHex(tx.body.hash()));
          },
        },
        {
          title: "sign",
          description: "Sign the transaction",
          disabled: signed,
          value: async () => {
            tx = tx.addSignatures([...(await wallet.signTx(tx))]);
          },
        },
        {
          title: "submit",
          description: "Submit the transaction to the network",
          disabled: !signed || submitted,
          value: async () => {
            const txId = await wallet.submitTx(tx);
            console.log("Transaction submitted! ID: ", txId.toHex());
            submitted = true;
          },
        },
        {
          title: "back",
          description: "Go back to the previous menu",
          value: () => {
            finished = true;
          },
        },
      ],
    });
    await txAction.action();
  }
};

export type { BuildTx };
export { handleTx };
