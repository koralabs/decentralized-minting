import { TxOutputDatum } from "@helios-lang/ledger";
import {
  expectByteArrayData,
  expectConstrData,
  expectIntData,
  makeByteArrayData,
  makeConstrData,
  makeIntData,
  UplcData,
} from "@helios-lang/uplc";

import { invariant } from "../../helpers/index.js";
import { Settings } from "../types/index.js";

const buildSettingsData = (settings: Settings): UplcData => {
  const { mint_governor, mint_version, data } = settings;
  return makeConstrData(0, [
    makeByteArrayData(mint_governor),
    makeIntData(mint_version),
    data,
  ]);
};

const decodeSettingsDatum = (datum: TxOutputDatum | undefined): Settings => {
  invariant(
    datum?.kind == "InlineTxOutputDatum",
    "Settings must be inline datum"
  );
  const datumData = datum.data;
  const settingsConstrData = expectConstrData(datumData, 0, 3);

  const mint_governor = expectByteArrayData(
    settingsConstrData.fields[0],
    "mint_governor must be ByteArray"
  ).toHex();

  const mint_version = expectIntData(settingsConstrData.fields[1]).value;

  const data = settingsConstrData.fields[2];

  return {
    mint_governor,
    mint_version,
    data,
  };
};

export { buildSettingsData, decodeSettingsDatum };
