import { DiscountClaim } from "../types/index.js";
import { buildMPTProofData } from "./mpt.js";
import {
  expectBytesHex,
  expectConstr,
  mkBytes,
  mkConstr,
  PlutusData,
} from "./plutusData.js";

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

// Identity-only view of a DiscountClaim — the qualifying asset's class + hashes, enough to
// resolve which reference inputs the fulfilment tx must attach (the MPF proof is not needed for
// resolution and has no PlutusData->proof decoder, so it's omitted here).
type DiscountClaimInfo =
  | { type: "rarity"; handle_name: string }
  | { type: "og"; handle_name: string }
  | { type: "partner"; policy_id: string; asset_name: string }
  | { type: "hal"; asset_name: string };

// Decode a DiscountClaim's identity from PlutusData (the inverse of buildDiscountClaimData,
// minus the proof). Used by the engine to find each qualifying asset's UTxO at fulfilment.
const decodeDiscountClaimInfo = (data: PlutusData): DiscountClaimInfo => {
  const constr = expectConstr(data, undefined, undefined, "DiscountClaim");
  const items = constr.fields.items;
  switch (Number(constr.constructor)) {
    case 0:
      return { type: "rarity", handle_name: expectBytesHex(items[0], "handle_name") };
    case 1:
      return { type: "og", handle_name: expectBytesHex(items[0], "handle_name") };
    case 2:
      return {
        type: "partner",
        policy_id: expectBytesHex(items[0], "policy_id"),
        asset_name: expectBytesHex(items[1], "asset_name"),
      };
    case 3:
      return { type: "hal", asset_name: expectBytesHex(items[0], "asset_name") };
    default:
      throw new Error(`unknown DiscountClaim constructor ${constr.constructor}`);
  }
};

export type { DiscountClaimInfo };
export { buildDiscountClaimData, decodeDiscountClaimInfo };
