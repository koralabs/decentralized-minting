import colors from "ansi-colors";
import cliProgress from "cli-progress";
import prompts from "prompts";

import {
  addHandle,
  clear,
  fillHandles,
  init,
  inspect,
  printProof,
  removeHandle,
} from "../../src/index.js";
import { getAllHandles } from "../handles.js";
import { CommandImpl } from "./types.js";

const doMPTActions = async (commandImpl: CommandImpl) => {
  let finished: boolean = false;

  while (!finished) {
    const mptAction = await prompts({
      message: "Pick an action",
      type: "select",
      name: "action",
      choices: [
        {
          title: "init",
          description: "Initialize a new handle database",
          value: async () => {
            commandImpl.mpt = await init(commandImpl.storePath);
          },
          disabled: !!commandImpl.mpt,
        },
        {
          title: "inspect",
          description: "Print out the current database state",
          value: () => inspect(commandImpl.mpt!),
          disabled: !commandImpl.mpt,
        },
        {
          title: "add",
          description: "Add an ADA Handle to the current root",
          value: async () => {
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
          },
          disabled: !commandImpl.mpt,
        },
        {
          title: "remove",
          description: "Remove an ada handle from the current root",
          value: async () => {
            const { key } = await prompts({
              name: "key",
              type: "text",
              message: "The key to remove",
            });
            await removeHandle(commandImpl.mpt!, key);
          },
          disabled: !commandImpl.mpt,
        },
        {
          title: "prove",
          description:
            "Prove the existence (or non-existence) of an ADA handle",
          value: async () => {
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
          },
          disabled: !commandImpl.mpt,
        },
        {
          title: "fill",
          description: "Fill the database with all existing ADA handles",
          value: async () => {
            const handles = await getAllHandles();
            const { confirmed } = await prompts({
              name: "confirmed",
              type: "confirm",
              message: `Are you sure you want to add ${colors.green(
                `${handles.length}`
              )} handles to the database?`,
            });

            if (confirmed) {
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
          },
          disabled:
            !commandImpl.mpt ||
            (!!commandImpl.mpt.hash &&
              Buffer.alloc(32).compare(commandImpl.mpt.hash) !== 0),
        },
        {
          title: "clear",
          description: "Clear the local db",
          value: async () => {
            const { confirmed } = await prompts({
              name: "confirmed",
              type: "confirm",
              message: "Are you sure you want to clear the database?",
            });
            if (confirmed) {
              await clear(commandImpl.storePath);
              commandImpl.mpt = null;
            }
          },
          disabled: !commandImpl.mpt,
        },
        {
          title: "back",
          description: "Back to main actions",
          value: () => {
            finished = true;
          },
        },
      ],
    });
    await mptAction.action();
  }
};

export { doMPTActions };
