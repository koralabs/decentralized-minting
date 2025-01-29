import {
  makeByteArrayData,
  makeConstrData,
  makeIntData,
  makeListData,
  UplcData,
} from "@helios-lang/uplc";

import { Neighbor, Proof, ProofStep } from "../types/index.js";

const buildProofData = (proof: Proof): UplcData => {
  return makeListData(proof.map(buildProofStepData));
};

const buildProofStepData = (proofStep: ProofStep): UplcData => {
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

export { buildNeighborData, buildProofData, buildProofStepData };
