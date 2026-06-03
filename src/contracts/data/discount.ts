import { DiscountClaim } from "../types/index.js";
import { buildMPTProofData } from "./mpt.js";
import { mkBytes, mkConstr, PlutusData } from "./plutusData.js";

// WS5 — encode a DiscountClaim to PlutusData. Constructor indices mirror the on-chain
// declaration order in discount.ak: RarityClaim=0, OgClaim=1, PartnerClaim=2, HalClaim=3.
const buildDiscountClaimData = (claim: DiscountClaim): PlutusData => {
  switch (claim.type) {
    case "rarity":
      return mkConstr(0, [mkBytes(claim.handle_name)]);
    case "og":
      return mkConstr(1, [mkBytes(claim.handle_name)]);
    case "partner":
      return mkConstr(2, [
        mkBytes(claim.policy_id),
        mkBytes(claim.asset_name),
        mkBytes(claim.value),
        buildMPTProofData(claim.proof),
      ]);
    case "hal":
      return mkConstr(3, [mkBytes(claim.asset_name)]);
  }
};

export { buildDiscountClaimData };
