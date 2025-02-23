import { Store, Trie } from "@aiken-lang/merkle-patricia-forestry";
import {
  BlockfrostV0Client,
  makeBlockfrostV0Client,
  makeSimpleWallet,
  NetworkName,
  restoreRootPrivateKey,
  SimpleWallet,
} from "@helios-lang/tx-utils";
import colors from "ansi-colors";
import cliProgress from "cli-progress";
import { existsSync } from "fs";
import prompts, { Choice } from "prompts";

import {
  deploy,
  fetchOrdersUTxOs,
  getAllHandles,
  getMintingDataCBOR,
  getSettingsCBOR,
  mayFailTransaction,
  mint,
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

type MainActionsType = "mpt" | "on-chain" | "exit";
type MPTActionsType =
  | "init"
  | "inspect"
  | "add"
  | "remove"
  | "prove"
  | "fill"
  | "upgrade"
  | "clear"
  | "back";
type OnChainActionsType =
  | "mint"
  | "request"
  | "deploy"
  | "settings"
  | "minting-data"
  | "back";

class CommandImpl {
  storePath: string;
  mpt: Trie | null;
  blockfrostCardanoClient: BlockfrostV0Client;
  wallet: SimpleWallet;
  running = true;

  constructor() {
    this.storePath = MPF_STORE_PATH(NETWORK as NetworkName);
    this.blockfrostCardanoClient = makeBlockfrostV0Client(
      NETWORK as NetworkName,
      BLOCKFROST_API_KEY
    );
    this.wallet = makeSimpleWallet(
      restoreRootPrivateKey(MNEMONIC.split(" ")),
      this.blockfrostCardanoClient
    );
    this.mpt = null;
  }

  async loadMPT() {
    if (existsSync(this.storePath)) {
      this.mpt = await Trie.load(new Store(this.storePath));
      console.log("Database exists, current state: ");
      console.log(this.mpt);
    } else {
      console.log("Database not exists");
    }
  }
}

const makeMainActionsChoices = (): Choice[] => {
  return [
    {
      title: "mpt",
      value: "mpt",
      description: "MPT actions",
    },
    {
      title: "on-chain",
      value: "on-chain",
      description: "On Chain actions",
    },
    {
      title: "exit",
      value: "exit",
      description: "Exit",
    },
  ];
};

const makeMPTActionsChoices = (commandImpl: CommandImpl): Choice[] => {
  const mpt = commandImpl.mpt;
  return [
    {
      title: "init",
      value: "init",
      disabled: !!mpt,
      description: "Initialize a new handle database",
    },
    {
      title: "inspect",
      value: "inspect",
      disabled: !mpt,
      description: "Print out the current database state",
    },
    {
      title: "add",
      value: "add",
      disabled: !mpt,
      description: "Add an ADA Handle to the current root",
    },
    {
      title: "remove",
      value: "remove",
      disabled: !mpt,
      description: "Remove an ada handle from the current root",
    },
    {
      title: "prove",
      value: "prove",
      disabled: !mpt,
      description: "Prove the existence (or non-existence) of an ADA handle",
    },
    {
      title: "fill",
      value: "fill",
      disabled:
        !mpt || (!!mpt.hash && Buffer.alloc(32).compare(mpt.hash) !== 0),
      description: "Fill the database with all existing ADA handles",
    },
    {
      title: "upgrade",
      value: "upgrade",
      disabled: !mpt,
      description:
        "Upgrade the protocol, modifying some settings as the settings governor",
    },
    {
      title: "clear",
      value: "clear",
      disabled: !mpt,
      description: "Clear the local db",
    },
    {
      title: "back",
      value: "back",
      description: "Back to main actions",
    },
  ];
};

const doMPTActions = async (commandImpl: CommandImpl): Promise<boolean> => {
  while (true) {
    const mptAction = await prompts({
      name: "action",
      type: "select",
      message: "Pick MPT action",
      choices: makeMPTActionsChoices(commandImpl),
    });
    try {
      switch (mptAction.action as MPTActionsType) {
        case "init": {
          commandImpl.mpt = await init(commandImpl.storePath);
          break;
        }
        case "inspect": {
          await inspect(commandImpl.mpt!);
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
          await addHandle(commandImpl.mpt!, key, value);
          break;
        }
        case "remove": {
          const { key } = await prompts({
            name: "key",
            type: "text",
            message: "The key to remove",
          });
          await removeHandle(commandImpl.mpt!, key);
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
          await printProof(commandImpl.mpt!, key, format);
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
            await fillHandles(commandImpl.mpt!, handles, () =>
              progress.increment()
            );
            progress.stop();
            console.log(commandImpl.mpt);
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
            await clear(commandImpl.storePath);
            commandImpl.mpt = null;
          }
          break;
        }
        default:
        case "back":
          return false;
      }
    } catch (err) {
      console.error(err);
    }
  }
};

const makeOnChainActionsChoices = (commandImpl: CommandImpl): Choice[] => {
  return [
    {
      title: "deploy",
      value: "deploy",
      description:
        "Deploy De-Mi Contracts (Mint V1 and Minting Data V1 validators)",
    },
    {
      title: "settings",
      value: "settings",
      disabled: !!commandImpl.mpt,
      description: "Build Settings Datum CBOR",
    },
    {
      title: "minting-data",
      value: "minting-data",
      disabled: !commandImpl.mpt,
      description: "Build Minting Data Datum CBOR",
    },
    {
      title: "request",
      value: "request",
      disabled: !commandImpl.mpt,
      description:
        "Request a new ADA handle by placing an order transaction on chain",
    },
    {
      title: "mint",
      value: "mint",
      disabled: !commandImpl.mpt,
      description: "Mint all new handles with a transaction on-chain",
    },
    {
      title: "back",
      value: "back",
      description: "Back to main actions",
    },
  ];
};

const doOnChainActions = async (commandImpl: CommandImpl): Promise<boolean> => {
  while (true) {
    const onChainAction = await prompts({
      name: "action",
      type: "select",
      message: "Pick On Chain action",
      choices: makeOnChainActionsChoices(commandImpl),
    });
    try {
      switch (onChainAction.action as OnChainActionsType) {
        case "deploy": {
          await handleTx(commandImpl.wallet, async () =>
            deploy(
              {
                network: NETWORK as NetworkName,
                walletWithoutKey: await makeWalletWithoutKeyFromSimpleWallet(
                  commandImpl.wallet
                ),
              },
              BLOCKFROST_API_KEY
            )
          );
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
            address: commandImpl.wallet.address,
          });
          if (txBuilderResult.ok) {
            await handleTx(
              commandImpl.wallet,
              async () =>
                await mayFailTransaction(
                  txBuilderResult.data,
                  commandImpl.wallet.address,
                  await commandImpl.wallet.utxos
                ).complete()
            );
            break;
          }
          console.error(`Error occured\n${txBuilderResult.error}`);
          break;
        }
        case "settings": {
          const settingsCborResult = await getSettingsCBOR({
            network: NETWORK as NetworkName,
          });
          if (!settingsCborResult.ok) {
            console.error(
              `Failed to get Settings CBOR: ${settingsCborResult.error}`
            );
            break;
          }
          console.log("\n\n------- Copy This Settings CBOR -------\n");
          console.log(settingsCborResult.data);
          console.log("\n\n");
          break;
        }
        case "minting-data": {
          const mintingDataCborResult = await getMintingDataCBOR({
            db: commandImpl.mpt!,
          });
          if (!mintingDataCborResult.ok) {
            console.error(
              `Failed to get Settings CBOR: ${mintingDataCborResult.error}`
            );
            break;
          }
          console.log("\n\n------- Copy This Minting Data CBOR -------\n");
          console.log(mintingDataCborResult.data);
          console.log("\n\n");
          break;
        }
        case "mint": {
          const ordersUtxosResult = await fetchOrdersUTxOs(
            { network: NETWORK as NetworkName },
            BLOCKFROST_API_KEY
          );
          if (!ordersUtxosResult.ok) {
            console.error(
              `Failed to fetch orders UTxOs: ${ordersUtxosResult.error}`
            );
            break;
          }
          const txBuilderResult = await mint(
            {
              network: NETWORK as NetworkName,
              db: commandImpl.mpt!,
              address: commandImpl.wallet.address,
              ordersUTxOs: ordersUtxosResult.data,
            },
            BLOCKFROST_API_KEY
          );
          if (txBuilderResult.ok) {
            if (
              await handleTx(
                commandImpl.wallet,
                async () =>
                  await mayFailTransaction(
                    txBuilderResult.data,
                    commandImpl.wallet.address,
                    await commandImpl.wallet.utxos
                  ).complete()
              )
            )
              break;
          }
          break;
        }
        default:
        case "back": {
          return false;
        }
      }
    } catch (err) {
      console.error(err);
    }
  }
};

const main = async () => {
  const commandImpl = new CommandImpl();

  while (commandImpl.running) {
    const mainAction = await prompts({
      name: "action",
      type: "select",
      message: "Pick main action",
      choices: makeMainActionsChoices(),
    });

    try {
      switch (mainAction.action as MainActionsType) {
        case "mpt": {
          await doMPTActions(commandImpl);
          break;
        }
        case "on-chain": {
          await doOnChainActions(commandImpl);
          break;
        }
        case "exit":
          commandImpl.running = false;
          break;
      }
    } catch (err) {
      console.error(err);
    }
  }
};

main();
