import { MPTProof, MPTProofStep, Neighbor } from "../types/index.js";
import {
  mkBytes,
  mkConstr,
  mkInt,
  mkList,
  PlutusData,
} from "./plutusData.js";

const buildMPTProofData = (proof: MPTProof): PlutusData =>
  mkList(proof.map(buildMPTProofStepData));

const buildMPTProofStepData = (proofStep: MPTProofStep): PlutusData => {
  if (proofStep.type == "branch") {
    return mkConstr(0, [
      mkInt(proofStep.skip),
      mkBytes(proofStep.neighbors),
    ]);
  }
  if (proofStep.type == "fork") {
    return mkConstr(1, [
      mkInt(proofStep.skip),
      buildNeighborData(proofStep.neighbor),
    ]);
  }
  return mkConstr(2, [
    mkInt(proofStep.skip),
    mkBytes(proofStep.key),
    mkBytes(proofStep.value),
  ]);
};

const buildNeighborData = (neighbor: Neighbor): PlutusData =>
  mkConstr(0, [
    mkInt(neighbor.nibble),
    mkBytes(neighbor.prefix),
    mkBytes(neighbor.root),
  ]);

export { buildMPTProofData, buildMPTProofStepData, buildNeighborData };
