import { OwnerSettings, SubHandleSettings } from "../types/index.js";
import {
  mkBytes,
  mkInt,
  mkList,
  PlutusData,
} from "./plutusData.js";

const buildTierPricingData = (
  tierPricing: Array<Array<bigint>>,
): PlutusData =>
  mkList(tierPricing.map((tier) => mkList(tier.map((v) => mkInt(v)))));

const buildSubHandleSettingsData = (
  subHandleSettings: SubHandleSettings,
): PlutusData => {
  const {
    public_minting_enabled,
    pz_enabled,
    tier_pricing,
    default_styles,
    save_original_address,
  } = subHandleSettings;
  return mkList([
    mkInt(public_minting_enabled),
    mkInt(pz_enabled),
    buildTierPricingData(tier_pricing),
    default_styles,
    mkInt(save_original_address),
  ]);
};

const buildOwnerSettingsData = (ownerSettings: OwnerSettings): PlutusData => {
  const {
    nft,
    virtual,
    buy_down_price,
    buy_down_paid,
    buy_down_percent,
    agreed_terms,
    migrate_sig_required,
    payment_address,
  } = ownerSettings;

  return mkList([
    buildSubHandleSettingsData(nft),
    buildSubHandleSettingsData(virtual),
    mkInt(buy_down_price),
    mkInt(buy_down_paid),
    mkInt(buy_down_percent),
    agreed_terms,
    mkInt(migrate_sig_required),
    mkBytes(payment_address),
  ]);
};

export {
  buildOwnerSettingsData,
  buildSubHandleSettingsData,
  buildTierPricingData,
};
