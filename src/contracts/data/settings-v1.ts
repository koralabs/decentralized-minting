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
    makeListData(
      settings.allowed_minters.map((item) => makeByteArrayData(item))
    ),
    buildAddressData(settings.treasury_address as ShelleyAddress),
    makeIntData(settings.treasury_fee),
    makeIntData(settings.minter_fee),
  ]);
};

const decodeSettingsV1Data = (data: UplcData): SettingsV1 => {
  const settingsV1ConstrData = expectConstrData(data, 0, 5);

  const policy_id = expectByteArrayData(
    settingsV1ConstrData.fields[0],
    "policy_id must be ByteArra"
  ).toHex();

  const allowedMintersListData = expectListData(
    settingsV1ConstrData.fields[1],
    "allowed_minters must be List"
  );
  const allowed_minters = allowedMintersListData.items.map((item) =>
    expectByteArrayData(item, "allowed_minters item must be ByteArray").toHex()
  );

  const treasury_address = decodeAddressFromData(
    settingsV1ConstrData.fields[2]
  );

  const treasury_fee = expectIntData(
    settingsV1ConstrData.fields[3],
    "treasury_fee must be Int"
  ).value;

  const minter_fee = expectIntData(
    settingsV1ConstrData.fields[4],
    "minter_fee must be Int"
  ).value;

  return {
    policy_id,
    allowed_minters,
    treasury_address,
    treasury_fee,
    minter_fee,
  };
};

export { buildSettingsV1Data, decodeSettingsV1Data };
