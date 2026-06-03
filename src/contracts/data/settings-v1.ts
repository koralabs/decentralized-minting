import type { NetworkName } from "../../helpers/cardano-sdk/networkName.js";
import { DiscountConfig, SettingsV1 } from "../types/index.js";
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
    buildDiscountConfigData(settings.discount_config),
  ]);
};

// WS5 — DiscountConfig: Constr 0 [ 7 ints + hal_policy_id bytes ].
const buildDiscountConfigData = (config: DiscountConfig): PlutusData =>
  mkConstr(0, [
    mkInt(config.partner_nft_bps),
    mkInt(config.hal_bps),
    mkInt(config.og_bps),
    mkInt(config.legendary_bps),
    mkInt(config.ultra_rare_bps),
    mkInt(config.rare_bps),
    mkInt(config.free_virtual_count),
    mkBytes(config.hal_policy_id),
  ]);

const decodeDiscountConfigData = (data: PlutusData): DiscountConfig => {
  const c = expectConstr(data, 0, 8, "DiscountConfig");
  const f = c.fields.items;
  return {
    partner_nft_bps: expectInt(f[0], "partner_nft_bps must be Int"),
    hal_bps: expectInt(f[1], "hal_bps must be Int"),
    og_bps: expectInt(f[2], "og_bps must be Int"),
    legendary_bps: expectInt(f[3], "legendary_bps must be Int"),
    ultra_rare_bps: expectInt(f[4], "ultra_rare_bps must be Int"),
    rare_bps: expectInt(f[5], "rare_bps must be Int"),
    free_virtual_count: expectInt(f[6], "free_virtual_count must be Int"),
    hal_policy_id: expectBytesHex(f[7], "hal_policy_id must be ByteArray"),
  };
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
  // Accept 8 (pre-WS5) or 9 (with discount_config) fields so tooling can read both the current
  // on-chain settings and the post-migration shape; pre-WS5 settings get an all-off default.
  const settingsV1ConstrData = expectConstr(data, 0, undefined, "SettingsV1");
  const fields = settingsV1ConstrData.fields.items;
  if (fields.length !== 8 && fields.length !== 9) {
    throw new Error(`SettingsV1: expected 8 or 9 fields, got ${fields.length}`);
  }

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

  const discount_config =
    fields.length >= 9
      ? decodeDiscountConfigData(fields[8])
      : {
          partner_nft_bps: 0n,
          hal_bps: 0n,
          og_bps: 0n,
          legendary_bps: 0n,
          ultra_rare_bps: 0n,
          rare_bps: 0n,
          free_virtual_count: 3n,
          hal_policy_id: "",
        };

  return {
    policy_id,
    allowed_minters,
    valid_handle_price_assets,
    treasury_address,
    treasury_fee_percentage,
    pz_script_address,
    order_script_hash,
    minting_data_script_hash,
    discount_config,
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
