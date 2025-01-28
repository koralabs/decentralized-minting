import { UplcData } from "@helios-lang/uplc";

interface Settings {
  settings_governor: string; // withdrawl script hash
  mint_governor: string; // withdrawl script hash
  data: UplcData;
}

export type { Settings };
