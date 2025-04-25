import { ShelleyAddress } from "@helios-lang/ledger";
import { NetworkName } from "@helios-lang/tx-utils";
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
    buildValidHandlePriceAssetsData(settings.valid_handle_price_assets),
    buildAddressData(settings.treasury_address as ShelleyAddress),
    makeIntData(settings.treasury_fee_percentage),
    buildAddressData(settings.pz_script_address as ShelleyAddress),
    makeByteArrayData(settings.order_script_hash),
    makeByteArrayData(settings.minting_data_script_hash),
  ]);
};

/**
 * Builds the valid handle price assets data for the settings v1.
 * @param valid_handle_price_assets - The valid handle price assets as string `{policy_id}.{asset_name}`
 * @returns The valid handle price assets data.
 */
const buildValidHandlePriceAssetsData = (
  valid_handle_price_assets: string[]
): UplcData => {
  return makeListData(
    valid_handle_price_assets.map((asset_id) => {
      const [policy_id, asset_name] = asset_id.split(".");
      return makeListData([
        makeByteArrayData(policy_id),
        makeByteArrayData(asset_name),
      ]);
    })
  );
};

const decodeSettingsV1Data = (
  data: UplcData,
  network: NetworkName
): SettingsV1 => {
  const settingsV1ConstrData = expectConstrData(data, 0, 8);

  const policy_id = expectByteArrayData(
    settingsV1ConstrData.fields[0],
    "policy_id must be ByteArray"
  ).toHex();

  // allowed_minters
  const allowedMintersListData = expectListData(
    settingsV1ConstrData.fields[1],
    "allowed_minters must be List"
  );
  const allowed_minters = allowedMintersListData.items.map((item) =>
    expectByteArrayData(item, "allowed_minters item must be ByteArray").toHex()
  );

  // valid_handle_price_assets
  const valid_handle_price_assets = decodeValidHandlePriceAssetsData(
    settingsV1ConstrData.fields[2]
  );

  // treasury_address
  const treasury_address = decodeAddressFromData(
    settingsV1ConstrData.fields[3],
    network
  );

  // treasury_fee_percentage
  const treasury_fee_percentage = expectIntData(
    settingsV1ConstrData.fields[4],
    "treasury_fee_percentage must be Int"
  ).value;

  // pz_script_address
  const pz_script_address = decodeAddressFromData(
    settingsV1ConstrData.fields[5],
    network
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
    valid_handle_price_assets,
    treasury_address,
    treasury_fee_percentage,
    pz_script_address,
    order_script_hash,
    minting_data_script_hash,
  };
};

const decodeValidHandlePriceAssetsData = (data: UplcData): string[] => {
  const validHandlePriceAssetsListData = expectListData(
    data,
    "valid_handle_price_assets must be List"
  );
  return validHandlePriceAssetsListData.items.map((assetData) => {
    const assetIdListData = expectListData(assetData, "asset_id must be List");
    const policyId = expectByteArrayData(
      assetIdListData.items[0],
      "policy_id must be ByteArray"
    ).toHex();
    const assetName = expectByteArrayData(
      assetIdListData.items[1],
      "asset_name must be ByteArray"
    ).toHex();
    return `${policyId}.${assetName}`;
  });
};

export { buildSettingsV1Data, decodeSettingsV1Data };
