import { UplcData } from "@helios-lang/uplc";

interface SubHandleSettings {
  public_minting_enabled: bigint;
  pz_enabled: bigint;
  tier_pricing: Array<Array<bigint>>;
  default_styles: UplcData;
  save_original_address: bigint;
}

interface OwnerSettings {
  nft: SubHandleSettings;
  virtual: SubHandleSettings;
  buy_down_price: bigint;
  buy_down_paid: bigint;
  buy_down_percent: bigint;
  agreed_terms: UplcData;
  migrate_sig_required: bigint;
  payment_address: string;
}

export type { OwnerSettings, SubHandleSettings };
