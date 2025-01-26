import { Store, Trie } from "@aiken-lang/merkle-patricia-forestry";
import { makeTxOutputId } from "@helios-lang/ledger";
import {
  makeBlockfrostV0Client,
  makeSimpleWallet,
  NetworkName,
  restoreRootPrivateKey,
} from "@helios-lang/tx-utils";
import colors from "ansi-colors";
import cliProgress from "cli-progress";
import { existsSync } from "fs";
import fs from "fs/promises";
import prompts from "prompts";

import {
  BLOCKFROST_API_KEY,
  INITIAL_UTXO_PATH,
  MNEMONIC,
  MPF_STORE_PATH,
  NETWORK,
} from "./configs/index.js";
import { getAllHandles } from "./handles.js";
import { handleTx } from "./helpers/index.js";
import {
  addHandle,
  clear,
  fillHandles,
  init,
  inspect,
  printProof,
  removeHandle,
} from "./store/index.js";
import { mintHandle, publish, requestHandle } from "./txs/index.js";

const main = async () => {
  const blockfrostCardanoClient = makeBlockfrostV0Client(
    NETWORK as NetworkName,
    BLOCKFROST_API_KEY
  );
  const wallet = makeSimpleWallet(
    restoreRootPrivateKey(MNEMONIC.split(" ")),
    blockfrostCardanoClient
  );

  let initialTxOutputIdString: string = "";
  if (existsSync(INITIAL_UTXO_PATH)) {
    initialTxOutputIdString = (await fs.readFile(INITIAL_UTXO_PATH)).toString();
  }

  let db: Trie | null = null;
  if (existsSync(MPF_STORE_PATH)) {
    db = await Trie.load(new Store(MPF_STORE_PATH));
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
          disabled:
            !db || (!!db.hash && Buffer.alloc(32).compare(db.hash) !== 0),
          description: "Fill the database with all existing ADA handles",
        },
        {
          title: "publish",
          value: "publish",
          disabled: !db || !!initialTxOutputIdString,
          description: "Publish the current root on chain",
        },
        {
          title: "request",
          value: "request",
          disabled: !db || !initialTxOutputIdString,
          description:
            "Request a new ADA handle by placing an order transaction on chain",
        },
        {
          title: "mint",
          value: "mint",
          disabled: !db || !initialTxOutputIdString,
          description: "Mint all new handles with a transaction on-chain",
        },
        {
          title: "upgrade",
          value: "upgrade",
          disabled: !db || !initialTxOutputIdString,
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
          db = await init(MPF_STORE_PATH);
          break;
        }
        case "inspect": {
          await inspect(db!);
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
          await addHandle(db!, key, value);
          break;
        }
        case "remove": {
          const { key } = await prompts({
            name: "key",
            type: "text",
            message: "The key to remove",
          });
          await removeHandle(db!, key);
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
          await printProof(db!, key, format);
          break;
        }
        case "fill": {
          const handles = await getAllHandles();
          const { confirm } = await prompts({
            name: "confirm",
            type: "confirm",
            message: `Are you sure you want to add ${colors.green(
              `${handles.length}`
            )} handles to the database?`,
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
            await fillHandles(db!, handles, () => progress.increment());
            progress.stop();
            console.log(db);
          }
          break;
        }
        case "publish": {
          if (await handleTx(wallet, publish(db!))) {
            return;
          }
          initialTxOutputIdString = (await fs.readFile("seed-utxo")).toString();
          break;
        }
        case "request": {
          const { handle } = await prompts({
            name: "handle",
            type: "text",
            message: "The handle you want to request",
          });
          const initialTxOutputId = makeTxOutputId(initialTxOutputIdString);
          if (
            await handleTx(wallet, requestHandle(initialTxOutputId, handle))
          ) {
            return;
          }
          break;
        }
        case "mint": {
          const initialTxOutputId = makeTxOutputId(initialTxOutputIdString);
          if (await handleTx(wallet, mintHandle(db!, initialTxOutputId))) {
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
            await clear(MPF_STORE_PATH);
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
};

main();
