import { ShelleyAddress } from "@helios-lang/ledger";
import {
  expectByteArrayData,
  expectConstrData,
  expectIntData,
  expectListData,
  makeByteArrayData,
  makeConstrData,
  makeIntData,
  makeListData,
  UplcData,
} from "@helios-lang/uplc";

import { SettingsV1 } from "../types/index.js";
import { buildAddressData, decodeAddressFromData } from "./common.js";

const buildSettingsV1Data = (settings: SettingsV1): UplcData => {
  return makeConstrData(0, [
    makeByteArrayData(settings.policy_id),
    makeByteArrayData(settings.all_handles),
    makeListData(
      settings.allowed_minters.map((item) => makeByteArrayData(item))
    ),
    buildAddressData(settings.treasury_address as ShelleyAddress),
    makeIntData(settings.treasury_fee),
    makeIntData(settings.minter_fee),
  ]);
};

const decodeSettingsV1Data = (data: UplcData): SettingsV1 => {
  const settingsV1ConstrData = expectConstrData(data, 0, 6);

  const policy_id = expectByteArrayData(
    settingsV1ConstrData.fields[0],
    "policy_id must be ByteArra"
  ).toHex();

  const all_handles = expectByteArrayData(
    settingsV1ConstrData.fields[1],
    "all_handles must be ByteArray"
  ).toHex();

  const allowedMintersListData = expectListData(
    settingsV1ConstrData.fields[2],
    "allowed_minters must be List"
  );
  const allowed_minters = allowedMintersListData.items.map((item) =>
    expectByteArrayData(item, "allowed_minters item must be ByteArray").toHex()
  );

  const treasury_address = decodeAddressFromData(
    settingsV1ConstrData.fields[3]
  );

  const treasury_fee = expectIntData(
    settingsV1ConstrData.fields[4],
    "treasury_fee must be Int"
  ).value;

  const minter_fee = expectIntData(
    settingsV1ConstrData.fields[5],
    "minter_fee must be Int"
  ).value;

  return {
    policy_id,
    all_handles,
    allowed_minters,
    treasury_address,
    treasury_fee,
    minter_fee,
  };
};

export { buildSettingsV1Data, decodeSettingsV1Data };
