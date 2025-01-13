import { Blaze, Blockfrost } from "@blaze-cardano/sdk";
import { handleTx } from "./src/transaction";
import prompts from "prompts";
import { existsSync, promises as fs } from "fs";
import { blockfrost_network, load_wallet } from "./src/utils";
import { Store, Trie } from "@aiken-lang/merkle-patricia-forestry";
import cliProgress from "cli-progress";
import colors from "ansi-colors";
import { clear, init, inspect } from "./src/db";
import { add_handle, print_proof, remove_handle } from "./src/simulation";
import { fill_handles, get_all_handles } from "./src/fill";
import { publish_tx } from "./src/publish";
import { request_handle } from "./src/order";
import { mint_handle } from "./src/mint";

async function run() {
  const provider = new Blockfrost({
    network: blockfrost_network(),
    projectId: process.env.PROJECT_ID!,
  });
  const wallet = await load_wallet(provider);
  const blaze = await Blaze.from(provider, wallet);
  let seed;
  if (existsSync("seed-utxo")) {
    seed = (await fs.readFile("seed-utxo")).toString();
  }

  let db;
  if (existsSync("db")) {
    db = await Trie.load(new Store("db"));
    console.log("Database exists, current state: ");
    console.log(db);
  }

  let exit = false;
  while (!exit) {
    const operation = await prompts({
      name: "operation",
      type: "select",
      message: "Pick an action: ",
      choices: [
        {
          title: "init",
          value: "init",
          disabled: !!db,
          description: "Initialize a new handle database",
        },
        {
          title: "inspect",
          value: "inspect",
          disabled: !db,
          description: "Print out the current database state",
        },
        {
          title: "add",
          value: "add",
          disabled: !db,
          description: "Add an ADA Handle to the current root",
        },
        {
          title: "remove",
          value: "remove",
          disabled: !db,
          description: "Remove an ada handle from the current root",
        },
        {
          title: "prove",
          value: "prove",
          disabled: !db,
          description:
            "Prove the existence (or non-existence) of an ADA handle",
        },
        {
          title: "fill",
          value: "fill",
          disabled: !db || Buffer.alloc(32).compare(db.hash) !== 0,
          description: "Fill the database with all existing ADA handles",
        },
        {
          title: "publish",
          value: "publish",
          disabled: !db || !!seed,
          description: "Publish the current root on chain",
        },
        {
          title: "request",
          value: "request",
          disabled: !db || !seed,
          description:
            "Request a new ADA handle by placing an order transaction on chain",
        },
        {
          title: "mint",
          value: "mint",
          disabled: !db || !seed,
          description: "Mint all new handles with a transaction on-chain",
        },
        {
          title: "upgrade",
          value: "upgrade",
          disabled: !db || !seed,
          description:
            "Upgrade the protocol, modifying some settings as the settings governor",
        },
        {
          title: "clear",
          value: "clear",
          disabled: !db,
          description: "Clear the local db",
        },
        {
          title: "exit",
          value: "exit",
          description: "Exit back to terminal",
        },
      ],
    });

    try {
      switch (operation["operation"]) {
        case "init": {
          db = await init("db");
          break;
        }
        case "inspect": {
          await inspect(db);
          break;
        }
        case "add": {
          const { key, value } = await prompts([
            {
              name: "key",
              type: "text",
              message: "The key to insert",
            },
            {
              name: "value",
              type: "text",
              message: "The value to store at this key",
            },
          ]);
          await add_handle(db, key, value);
          break;
        }
        case "remove": {
          const { key } = await prompts({
            name: "key",
            type: "text",
            message: "The key to remove",
          });
          await remove_handle(db, key);
          break;
        }
        case "prove": {
          const { key, format } = await prompts([
            {
              name: "key",
              type: "text",
              message: "The key to prove",
            },
            {
              name: "format",
              type: "select",
              message: "What format would you like the proof in?",
              choices: [
                { title: "JSON", value: "json" },
                { title: "cborHex", value: "cborHex" },
              ],
            },
          ]);
          await print_proof(db, key, format);
          break;
        }
        case "fill": {
          let handles = await get_all_handles();
          const { confirm } = await prompts({
            name: "confirm",
            type: "confirm",
            message: `Are you sure you want to add ${colors.green(`${handles.length}`)} handles to the database?`,
          });

          if (confirm) {
            const progress = new cliProgress.SingleBar({
              format:
                "|" +
                colors.green("{bar}") +
                "| {percentage}% | {value}/{total} Handles | ETA: {eta_formatted} |",
              barCompleteChar: "\u2588",
              barIncompleteChar: "\u2591",
              clearOnComplete: true,
              etaBuffer: 50,
            });
            progress.start(handles.length, 0);
            await fill_handles(db, handles, progress.increment);
            progress.stop();
            console.log(db);
          }
          break;
        }
        case "publish": {
          if (await handleTx(blaze, publish_tx(db))) {
            return;
          }
          seed = (await fs.readFile("seed-utxo")).toString();
          break;
        }
        case "request": {
          const { handle } = await prompts({
            name: "handle",
            type: "text",
            message: "The handle you want to request",
          });
          if (await handleTx(blaze, request_handle(seed!, handle))) {
            return;
          }
          break;
        }
        case "mint": {
          if (await handleTx(blaze, mint_handle(db, seed!))) {
            return;
          }
          break;
        }
        case "clear": {
          const { confirm } = await prompts({
            name: "confirm",
            type: "confirm",
            message: "Are you sure you want to clear the database?",
          });
          if (confirm) {
            await clear("db");
            db = null;
          }
          break;
        }
        case "exit":
          exit = true;
          break;
        default:
          console.log("Action aborted");
          exit = true;
      }
    } catch (e) {
      console.error(e);
    }
  }
}

run();
