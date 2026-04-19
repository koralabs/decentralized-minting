import { invariant } from "../../helpers/index.js";
import { Settings } from "../types/index.js";
import {
  expectBytesHex,
  expectConstr,
  expectInt,
  mkBytes,
  mkConstr,
  mkInt,
  PlutusData,
  plutusDataFromCbor,
} from "./plutusData.js";

const buildSettingsData = (settings: Settings): PlutusData => {
  const { mint_governor, mint_version, data } = settings;
  return mkConstr(0, [
    mkBytes(mint_governor),
    mkInt(mint_version),
    data,
  ]);
};

const decodeSettingsDatum = (datumCbor: string | undefined): Settings => {
  invariant(datumCbor, "Settings must have inline datum");
  const datumData = plutusDataFromCbor(datumCbor);
  const settingsConstrData = expectConstr(datumData, 0, 3, "Settings");

  const mint_governor = expectBytesHex(
    settingsConstrData.fields.items[0],
    "mint_governor must be ByteArray",
  );

  const mint_version = expectInt(
    settingsConstrData.fields.items[1],
    "mint_version must be Int",
  );

  const data = settingsConstrData.fields.items[2];

  return {
    mint_governor,
    mint_version,
    data,
  };
};

export { buildSettingsData, decodeSettingsDatum };
