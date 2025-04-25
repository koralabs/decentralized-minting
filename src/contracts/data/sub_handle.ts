import {
  makeByteArrayData,
  makeIntData,
  makeListData,
  UplcData,
} from "@helios-lang/uplc";

import { OwnerSettings, SubHandleSettings } from "../types/index.js";

const buildTierPricingData = (tierPricing: Array<Array<bigint>>): UplcData => {
  return makeListData(
    tierPricing.map((tier) => makeListData(tier.map(makeIntData)))
  );
};

const buildSubHandleSettingsData = (
  subHandleSettings: SubHandleSettings
): UplcData => {
  const {
    public_minting_enabled,
    pz_enabled,
    tier_pricing,
    default_styles,
    save_original_address,
  } = subHandleSettings;
  return makeListData([
    makeIntData(public_minting_enabled),
    makeIntData(pz_enabled),
    buildTierPricingData(tier_pricing),
    default_styles,
    makeIntData(save_original_address),
  ]);
};

const buildOwnerSettingsData = (ownerSettings: OwnerSettings): UplcData => {
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

  return makeListData([
    buildSubHandleSettingsData(nft),
    buildSubHandleSettingsData(virtual),
    makeIntData(buy_down_price),
    makeIntData(buy_down_paid),
    makeIntData(buy_down_percent),
    agreed_terms,
    makeIntData(migrate_sig_required),
    makeByteArrayData(payment_address),
  ]);
};

export {
  buildOwnerSettingsData,
  buildSubHandleSettingsData,
  buildTierPricingData,
};
