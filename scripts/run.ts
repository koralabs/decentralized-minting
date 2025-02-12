import { Store, Trie } from "@aiken-lang/merkle-patricia-forestry";
import {
  makeBlockfrostV0Client,
  makeSimpleWallet,
  NetworkName,
  restoreRootPrivateKey,
} from "@helios-lang/tx-utils";
import colors from "ansi-colors";
import cliProgress from "cli-progress";
import { existsSync } from "fs";
import prompts from "prompts";

import {
  getAllHandles,
  mayFailTransaction,
  mint,
  publish,
  request,
} from "../src/index.js";
import {
  BLOCKFROST_API_KEY,
  MNEMONIC,
  MPF_STORE_PATH,
  NETWORK,
} from "./constants.js";
import {
  addHandle,
  clear,
  fillHandles,
  init,
  inspect,
  printProof,
  removeHandle,
} from "./store/index.js";
import { handleTx } from "./tx.js";
import { makeWalletWithoutKeyFromSimpleWallet } from "./utils.js";

const main = async () => {
  const storePath = MPF_STORE_PATH(NETWORK as NetworkName);
  const blockfrostCardanoClient = makeBlockfrostV0Client(
    NETWORK as NetworkName,
    BLOCKFROST_API_KEY
  );
  const wallet = makeSimpleWallet(
    restoreRootPrivateKey(MNEMONIC.split(" ")),
    blockfrostCardanoClient
  );

  let db: Trie | null = null;
  if (existsSync(storePath)) {
    db = await Trie.load(new Store(storePath));
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
          disabled: !db,
          description: "Publish the current root on chain",
        },
        {
          title: "request",
          value: "request",
          disabled: !db,
          description:
            "Request a new ADA handle by placing an order transaction on chain",
        },
        {
          title: "mint",
          value: "mint",
          disabled: !db,
          description: "Mint all new handles with a transaction on-chain",
        },
        {
          title: "upgrade",
          value: "upgrade",
          disabled: !db,
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
          db = await init(storePath);
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
          if (
            await handleTx(wallet, async () =>
              publish(
                {
                  network: NETWORK as NetworkName,
                  db: db!,
                  walletWithoutKey: await makeWalletWithoutKeyFromSimpleWallet(
                    wallet
                  ),
                },
                BLOCKFROST_API_KEY
              )
            )
          ) {
            return;
          }
          break;
        }
        case "request": {
          const { handle } = await prompts({
            name: "handle",
            type: "text",
            message: "The handle you want to request",
          });
          const txBuilderResult = await request({
            network: NETWORK as NetworkName,
            handleName: handle,
            address: wallet.address,
          });
          if (txBuilderResult.ok) {
            if (
              await handleTx(
                wallet,
                async () =>
                  await mayFailTransaction(
                    txBuilderResult.data,
                    wallet.address,
                    await wallet.utxos
                  ).complete()
              )
            )
              return;
          }
          break;
        }
        case "mint": {
          const txBuilderResult = await mint(
            {
              network: NETWORK as NetworkName,
              db: db!,
              address: wallet.address,
            },
            BLOCKFROST_API_KEY
          );
          if (txBuilderResult.ok) {
            if (
              await handleTx(
                wallet,
                async () =>
                  await mayFailTransaction(
                    txBuilderResult.data,
                    wallet.address,
                    await wallet.utxos
                  ).complete()
              )
            )
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
            await clear(storePath);
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
