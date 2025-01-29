import { TxOutputDatum } from "@helios-lang/ledger";
import {
  expectByteArrayData,
  expectConstrData,
  makeByteArrayData,
  makeConstrData,
  UplcData,
} from "@helios-lang/uplc";

import { invariant } from "../../helpers/index.js";
import { Settings } from "../types/index.js";

const buildSettingsData = (settings: Settings): UplcData => {
  const { settings_governor, mint_governor, data } = settings;

  return makeConstrData(0, [
    makeByteArrayData(settings_governor),
    makeByteArrayData(mint_governor),
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

  const settings_governor = expectByteArrayData(
    settingsConstrData.fields[0],
    "settings_governor must be ByteArray"
  ).toHex();

  const mint_governor = expectByteArrayData(
    settingsConstrData.fields[1],
    "mint_governor must be ByteArray"
  ).toHex();

  const data = settingsConstrData.fields[2];

  return {
    settings_governor,
    mint_governor,
    data,
  };
};

export { buildSettingsData, decodeSettingsDatum };
