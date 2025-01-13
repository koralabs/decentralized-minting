import { Blaze, Blockfrost, Core, Wallet } from "@blaze-cardano/sdk";
import prompts from "prompts";
import { promises as fs } from "fs";

export async function handleTx(
  blaze: Blaze<Blockfrost, Wallet>,
  buildTx: (blaze: Blaze<Blockfrost, Wallet>) => Promise<Core.Transaction>,
): Promise<boolean> {
  let tx = await buildTx(blaze);
  let submitted = false;
  for (;;) {
    let signed = (tx?.witnessSet()?.vkeys()?.size() || 0) > 0;
    let next = await prompts({
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
        console.log(tx.toCbor());
        break;
      }
      case "txid": {
        console.log(tx.getId());
        break;
      }
      case "sign": {
        tx = await blaze.signTransaction(tx);
        break;
      }
      case "save": {
        let save_choices = await prompts([
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
            let envelope = {
              type: signed
                ? "Witnessed Tx BabbageEra"
                : "Unwitnessed Tx BabbageEra",
              description: "",
              cborHex: tx.toCbor(),
            };
            await fs.writeFile(
              save_choices["path"],
              JSON.stringify(envelope, null, 2),
            );
            break;
          }
          case "hex": {
            await fs.writeFile(save_choices["path"], tx.toCbor());
            break;
          }
          case "raw": {
            await fs.writeFile(
              save_choices["path"],
              Buffer.from(tx.toCbor(), "hex"),
            );
            break;
          }
        }
        break;
      }
      case "submit": {
        let tx_id = await blaze.submitTransaction(tx);
        console.log("Transaction submitted! ID: ", tx_id);
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
}
