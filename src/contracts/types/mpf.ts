type MPTProof = MPTProofStep[];

type MPTProofStep = BranchProofStep | ForkProofStep | LeafProofStep;

interface BranchProofStep {
  type: "branch";
  skip: number;
  neighbors: string;
}

interface ForkProofStep {
  type: "fork";
  skip: number;
  neighbor: Neighbor;
}

interface LeafProofStep {
  type: "leaf";
  skip: number;
  key: string;
  value: string;
}

interface Neighbor {
  nibble: number;
  prefix: string;
  root: string;
}

const parseMPTProofJSON = (jsonObject: object): MPTProof => {
  if (!Array.isArray(jsonObject))
    throw new Error("Proof JSON object is not an array");
  return jsonObject.map((proofStepJson) =>
    parseMPTProofStepJSON(proofStepJson)
  );
};

const parseMPTProofStepJSON = (jsonObject: object): MPTProofStep => {
  if (!("skip" in jsonObject)) throw new Error("skip field is missing");
  if (!("type" in jsonObject)) throw new Error("type field is missing");

  if (jsonObject.type == "branch") {
    if (!("neighbors" in jsonObject))
      throw new Error("neighbors field is missing");
    return {
      type: "branch",
      skip: jsonObject.skip,
      neighbors: jsonObject.neighbors,
    } as BranchProofStep;
  } else if (jsonObject.type == "fork") {
    if (!("neighbor" in jsonObject))
      throw new Error("neighbor field is missing");
    return {
      type: "fork",
      skip: jsonObject.skip,
      neighbor: jsonObject.neighbor,
    } as ForkProofStep;
  } else if (jsonObject.type == "leaf") {
    if (!("neighbor" in jsonObject))
      throw new Error("neighbor field is missing");
    return {
      type: "leaf",
      skip: jsonObject.skip,
      key: (jsonObject.neighbor as { key: string; value: string }).key,
      value: (jsonObject.neighbor as { key: string; value: string }).value,
    } as LeafProofStep;
  } else {
    throw new Error("type is invalid");
  }
};

export type { MPTProof, MPTProofStep, Neighbor };
export { parseMPTProofJSON, parseMPTProofStepJSON };
