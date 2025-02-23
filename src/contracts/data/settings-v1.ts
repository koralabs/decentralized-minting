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
    buildAddressData(settings.pz_script_address as ShelleyAddress),
    makeByteArrayData(settings.order_script_hash),
    makeByteArrayData(settings.minting_data_script_hash),
  ]);
};

const decodeSettingsV1Data = (data: UplcData): SettingsV1 => {
  const settingsV1ConstrData = expectConstrData(data, 0, 8);

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

  const pz_script_address = decodeAddressFromData(
    settingsV1ConstrData.fields[5]
  );

  const order_script_hash = expectByteArrayData(
    settingsV1ConstrData.fields[6]
  ).toHex();

  const minting_data_script_hash = expectByteArrayData(
    settingsV1ConstrData.fields[7]
  ).toHex();

  return {
    policy_id,
    allowed_minters,
    treasury_address,
    treasury_fee,
    minter_fee,
    pz_script_address,
    order_script_hash,
    minting_data_script_hash,
  };
};

export { buildSettingsV1Data, decodeSettingsV1Data };
