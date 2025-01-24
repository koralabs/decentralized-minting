import { TxOutputDatum } from "@helios-lang/ledger";
import { expectByteArrayData, expectConstrData } from "@helios-lang/uplc";
import { invariant } from "helpers/index.js";

import { Settings } from "../types/index.js";

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

export { decodeSettingsDatum };
