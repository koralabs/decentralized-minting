import { makeListData, UplcData } from "@helios-lang/uplc";

import { Proof } from "../types/index.js";
import { buildProofData } from "./mpf.js";

const buildProofsRedeemer = (proofs: Proof[]): UplcData => {
  return makeListData(proofs.map(buildProofData));
};

export { buildProofsRedeemer };
