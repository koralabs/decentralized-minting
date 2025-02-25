import { TxOutputDatum } from "@helios-lang/ledger";
import {
  expectByteArrayData,
  expectConstrData,
  makeByteArrayData,
  makeConstrData,
  UplcData,
} from "@helios-lang/uplc";

import { invariant } from "../../helpers/index.js";
import { MintingData } from "../types/index.js";

const buildMintingData = (mintingData: MintingData): UplcData => {
  return makeConstrData(0, [makeByteArrayData(mintingData.mpt_root_hash)]);
};

const decodeMintingDataDatum = (
  datum: TxOutputDatum | undefined
): MintingData => {
  invariant(
    datum?.kind == "InlineTxOutputDatum",
    "Minting Data Datum must be inline datum"
  );
  const datumData = datum.data;
  const mintingDataConstrData = expectConstrData(datumData, 0, 1);

  const mpt_root_hash = expectByteArrayData(
    mintingDataConstrData.fields[0],
    "mpt_root_hash must be ByteArray"
  ).toHex();

  return { mpt_root_hash };
};

export { buildMintingData, decodeMintingDataDatum };
