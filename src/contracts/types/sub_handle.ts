import type { PlutusData } from "../data/plutusData.js";

interface SubHandleSettings {
  public_minting_enabled: bigint;
  pz_enabled: bigint;
  tier_pricing: Array<Array<bigint>>;
  default_styles: PlutusData;
  save_original_address: bigint;
}

interface OwnerSettings {
  nft: SubHandleSettings;
  virtual: SubHandleSettings;
  buy_down_price: bigint;
  buy_down_paid: bigint;
  buy_down_percent: bigint;
  agreed_terms: PlutusData;
  migrate_sig_required: bigint;
  payment_address: string;
}

export type { OwnerSettings, SubHandleSettings };
