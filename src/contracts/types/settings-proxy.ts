import type { PlutusData } from "../data/plutusData.js";

interface Settings {
  mint_governor: string; // withdrawal script hash
  mint_version: bigint;
  data: PlutusData; // settings v1 data
}

export type { Settings };
