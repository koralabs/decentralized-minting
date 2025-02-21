import {
  makeByteArrayData,
  makeConstrData,
  makeIntData,
  makeListData,
  UplcData,
} from "@helios-lang/uplc";

import { MPTProof, MPTProofStep, Neighbor } from "../types/index.js";

const buildMPTProofData = (proof: MPTProof): UplcData => {
  return makeListData(proof.map(buildMPTProofStepData));
};

const buildMPTProofStepData = (proofStep: MPTProofStep): UplcData => {
  if (proofStep.type == "branch") {
    return makeConstrData(0, [
      makeIntData(proofStep.skip),
      makeByteArrayData(proofStep.neighbors),
    ]);
  } else if (proofStep.type == "fork") {
    return makeConstrData(1, [
      makeIntData(proofStep.skip),
      buildNeighborData(proofStep.neighbor),
    ]);
  } else {
    return makeConstrData(2, [
      makeIntData(proofStep.skip),
      makeByteArrayData(proofStep.key),
      makeByteArrayData(proofStep.value),
    ]);
  }
};

const buildNeighborData = (neighbor: Neighbor): UplcData => {
  return makeConstrData(0, [
    makeIntData(neighbor.nibble),
    makeByteArrayData(neighbor.prefix),
    makeByteArrayData(neighbor.root),
  ]);
};

export { buildMPTProofData, buildMPTProofStepData, buildNeighborData };
