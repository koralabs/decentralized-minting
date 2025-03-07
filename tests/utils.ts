import { bytesToHex } from "@helios-lang/codec-utils";
import {
  addValues,
  makeAssetClass,
  makeAssets,
  makeValue,
} from "@helios-lang/ledger";
import { SimpleWallet } from "@helios-lang/tx-utils";
import { decodeUplcProgramV2FromCbor, UplcProgramV2 } from "@helios-lang/uplc";

import { PREFIX_100, PREFIX_222 } from "../src/constants/index.js";

const alwaysSuceedMintUplcProgram = (): UplcProgramV2 => {
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

export {
  alwaysSuceedMintUplcProgram,
  balanceOf,
  extractScriptCborsFromUplcProgram,
  referenceAssetValue,
  userAssetValue,
};
