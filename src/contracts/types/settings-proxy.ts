import { UplcData } from "@helios-lang/uplc";

interface Settings {
  mint_governor: string; // withdrawl script hash
  data: UplcData;
}

export type { Settings };
