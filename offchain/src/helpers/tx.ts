import { bytesToHex } from "@helios-lang/codec-utils";
import { SimpleWallet } from "@helios-lang/tx-utils";
import { promises as fs } from "fs";
import prompts from "prompts";
import { Result } from "ts-res";

import { BuildTxError, TxSuccessResult } from "./error/tx.js";

type BuildTx = (
  wallet: SimpleWallet
) => Promise<Result<TxSuccessResult, Error | BuildTxError>>;

const handleTx = async (
  wallet: SimpleWallet,
  buildTx: BuildTx
): Promise<boolean> => {
  const txResult = await buildTx(wallet);
  if (!txResult.ok) {
    console.error(txResult.error.message);
    throw txResult.error;
  }

  let { tx } = txResult.data;
  const { dump } = txResult.data;
  let submitted = false;
  for (;;) {
    const signed = tx.witnesses.signatures.length > 0;
    const next = await prompts({
      name: "next",
      message: "Transaction built! What would you like to do next?",
      type: "select",
      choices: [
        {
          title: "print",
          description: "Print out the raw CBOR of the transaction",
          value: "print",
        },
        {
          title: "txid",
          description: "Print the transaction ID",
          value: "txid",
        },
        {
          title: "sign",
          disabled: signed,
          description: "Sign the transaction",
          value: "sign",
        },
        {
          title: "submit",
          disabled: !signed || submitted,
          description: "Submit the transaction to the network",
          value: "submit",
        },
        {
          title: "save",
          description: "Save the transaction to disk",
          value: "save",
        },
        {
          title: "back",
          description: "Go back to the previous menu",
          value: "back",
        },
        {
          title: "exit",
          description: "Exit back to terminal",
          value: "exit",
        },
      ],
    });

    switch (next["next"]) {
      case "print": {
        console.log({ cbor: bytesToHex(tx.toCbor()), dump });
        break;
      }
      case "txid": {
        console.log(bytesToHex(tx.body.hash()));
        break;
      }
      case "sign": {
        tx = tx.addSignatures([...(await wallet.signTx(tx))]);
        break;
      }
      case "save": {
        const save_choices = await prompts([
          {
            name: "path",
            message: "Where would you like to save the transaction?",
            type: "text",
            initial: "swap.tx",
          },
          {
            name: "type",
            message: "How do you want to format the file?",
            type: "select",
            choices: [
              {
                title: "json",
                value: "json",
                description:
                  "a JSON envelope with the cborHex, as used by the CLI",
              },
              {
                title: "hex",
                value: "hex",
                description: "the raw hex file, without the json envelope",
              },
              {
                title: "raw",
                value: "raw",
                description:
                  "the raw bytes, not hex encoded, and without a json envelope",
              },
            ],
          },
        ]);

        switch (save_choices["type"]) {
          case "json": {
            const envelope = {
              type: signed
                ? "Witnessed Tx BabbageEra"
                : "Unwitnessed Tx BabbageEra",
              description: "",
              cborHex: bytesToHex(tx.toCbor()),
            };
            await fs.writeFile(
              save_choices["path"],
              JSON.stringify(envelope, null, 2)
            );
            break;
          }
          case "hex": {
            await fs.writeFile(save_choices["path"], bytesToHex(tx.toCbor()));
            break;
          }
          case "raw": {
            await fs.writeFile(save_choices["path"], Buffer.from(tx.toCbor()));
            break;
          }
        }
        break;
      }
      case "submit": {
        const txId = await wallet.submitTx(tx);
        console.log("Transaction submitted! ID: ", txId.toHex());
        submitted = true;
        break;
      }
      case "exit":
        return true;
      case "back":
      default: {
        return false;
      }
    }
  }
};

export type { BuildTx };
export { handleTx };
