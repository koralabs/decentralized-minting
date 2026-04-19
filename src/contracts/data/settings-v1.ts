import type { NetworkName } from "../../helpers/cardano-sdk/networkName.js";
import { SettingsV1 } from "../types/index.js";
import {
  buildAddressData,
  decodeAddressFromData,
  expectBytesHex,
  expectConstr,
  expectInt,
  expectList,
  mkBytes,
  mkConstr,
  mkInt,
  mkList,
  PlutusData,
} from "./plutusData.js";

const buildSettingsV1Data = (settings: SettingsV1): PlutusData => {
  return mkConstr(0, [
    mkBytes(settings.policy_id),
    mkList(settings.allowed_minters.map((item) => mkBytes(item))),
    buildValidHandlePriceAssetsData(settings.valid_handle_price_assets),
    buildAddressData(settings.treasury_address),
    mkInt(settings.treasury_fee_percentage),
    buildAddressData(settings.pz_script_address),
    mkBytes(settings.order_script_hash),
    mkBytes(settings.minting_data_script_hash),
  ]);
};

/**
 * Builds the valid_handle_price_assets data for settings v1.
 * Input: asset ids in the form `{policyId}.{assetName}` (both hex).
 */
const buildValidHandlePriceAssetsData = (
  valid_handle_price_assets: string[],
): PlutusData =>
  mkList(
    valid_handle_price_assets.map((assetId) => {
      const [policyId, assetName] = assetId.split(".");
      return mkList([mkBytes(policyId), mkBytes(assetName)]);
    }),
  );

const decodeSettingsV1Data = (
  data: PlutusData,
  network: NetworkName,
): SettingsV1 => {
  const settingsV1ConstrData = expectConstr(data, 0, 8, "SettingsV1");
  const fields = settingsV1ConstrData.fields.items;

  const policy_id = expectBytesHex(fields[0], "policy_id must be ByteArray");

  const allowed_minters = expectList(
    fields[1],
    "allowed_minters must be List",
  ).map((item) => expectBytesHex(item, "allowed_minters item must be ByteArray"));

  const valid_handle_price_assets = decodeValidHandlePriceAssetsData(fields[2]);

  const treasury_address = decodeAddressFromData(fields[3], network);

  const treasury_fee_percentage = expectInt(
    fields[4],
    "treasury_fee_percentage must be Int",
  );

  const pz_script_address = decodeAddressFromData(fields[5], network);

  const order_script_hash = expectBytesHex(
    fields[6],
    "order_script_hash must be ByteArray",
  );

  const minting_data_script_hash = expectBytesHex(
    fields[7],
    "minting_data_script_hash must be ByteArray",
  );

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

const decodeValidHandlePriceAssetsData = (data: PlutusData): string[] =>
  expectList(data, "valid_handle_price_assets must be List").map((assetData) => {
    const items = expectList(assetData, "asset_id must be List");
    const policyId = expectBytesHex(items[0], "policy_id must be ByteArray");
    const assetName = expectBytesHex(items[1], "asset_name must be ByteArray");
    return `${policyId}.${assetName}`;
  });

export { buildSettingsV1Data, decodeSettingsV1Data };
