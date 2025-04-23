import { bytesToHex } from "@helios-lang/codec-utils";
import {
  addValues,
  makeAssetClass,
  makeAssets,
  makeValue,
} from "@helios-lang/ledger";
import { SimpleWallet } from "@helios-lang/tx-utils";
import { decodeUplcProgramV2FromCbor, UplcProgramV2 } from "@helios-lang/uplc";
import fs from "fs/promises";
import { Result } from "ts-res";

import { PREFIX_000, PREFIX_100, PREFIX_222 } from "../src/constants/index.js";
import { BuildTxError, invariant, TxSuccessResult } from "../src/index.js";

const alwaysSucceedMintUplcProgram = (): UplcProgramV2 => {
  return decodeUplcProgramV2FromCbor(
    "5834010000323232323222533300353330033370e900018021baa3006300730053754002294458526136565734aae7555cf2ba157441"
  );
};

const extractScriptCborsFromUplcProgram = (
  uplcProgram: UplcProgramV2
): [string, string] => {
  return [
    bytesToHex(uplcProgram.toCbor()),
    bytesToHex(uplcProgram.alt!.toCbor()),
  ];
};

const balanceOf = async (wallet: SimpleWallet) => {
  const utxos = await wallet.utxos;
  const balance = utxos.reduce((acc, utxo) => {
    return addValues([acc, utxo.value]);
  }, makeValue(0n));
  return balance;
};

const userAssetClass = (policyId: string, handleName: string) => {
  return makeAssetClass(
    `${policyId}.${PREFIX_222}${Buffer.from(handleName).toString("hex")}`
  );
};

const referenceAssetClass = (policyId: string, handleName: string) => {
  return makeAssetClass(
    `${policyId}.${PREFIX_100}${Buffer.from(handleName).toString("hex")}`
  );
};

const virtualSubHandleAssetClass = (policyId: string, handleName: string) => {
  return makeAssetClass(
    `${policyId}.${PREFIX_000}${Buffer.from(handleName).toString("hex")}`
  );
};

const userAssetValue = (policyId: string, handleName: string) => {
  return makeValue(
    1n,
    makeAssets([
      [
        makeAssetClass(
          `${policyId}.${PREFIX_222}${Buffer.from(handleName).toString("hex")}`
        ),
        1n,
      ],
    ])
  );
};

const referenceAssetValue = (policyId: string, handleName: string) => {
  return makeValue(
    1n,
    makeAssets([
      [
        makeAssetClass(
          `${policyId}.${PREFIX_100}${Buffer.from(handleName).toString("hex")}`
        ),
        1n,
      ],
    ])
  );
};

const virtualSubHandleAssetValue = (policyId: string, handleName: string) => {
  return makeValue(
    1n,
    makeAssets([
      [
        makeAssetClass(
          `${policyId}.${PREFIX_000}${Buffer.from(handleName).toString("hex")}`
        ),
        1n,
      ],
    ])
  );
};

const getRandomString = (min: number, max: number): string => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-";
  const length = Math.floor(Math.random() * (max - min + 1)) + min;
  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
};

const writeSuccessfulTxJson = async (
  txResult: Result<TxSuccessResult, Error | BuildTxError>
) => {
  invariant(txResult.ok);
  await fs.writeFile(
    "successful-tx.json",
    JSON.stringify(txResult.data.dump, null, 2)
  );
};

const writeFailedTxJson = async (
  txResult: Result<TxSuccessResult, Error | BuildTxError>
) => {
  invariant(!txResult.ok);
  await fs.writeFile(
    "failed-tx.json",
    JSON.stringify((txResult.error as BuildTxError).failedTxJson, null, 2)
  );
};

export {
  alwaysSucceedMintUplcProgram,
  balanceOf,
  extractScriptCborsFromUplcProgram,
  getRandomString,
  referenceAssetClass,
  referenceAssetValue,
  userAssetClass,
  userAssetValue,
  virtualSubHandleAssetClass,
  virtualSubHandleAssetValue,
  writeFailedTxJson,
  writeSuccessfulTxJson,
};
