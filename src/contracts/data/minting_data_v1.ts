import {
  makeByteArrayData,
  makeConstrData,
  makeIntData,
  makeListData,
  UplcData,
} from "@helios-lang/uplc";

import { Handle, Proof } from "../types/index.js";
import { buildMPTProofData } from "./mpf.js";

const buildHandleData = (handle: Handle): UplcData => {
  if (handle.type == "legacy") {
    return makeConstrData(0, [makeByteArrayData(handle.handle_name)]);
  } else {
    return makeConstrData(1, [makeByteArrayData(handle.handle_name)]);
  }
};

const buildProofData = (proof: Proof): UplcData => {
  const { mpt_proof, handle, amount } = proof;
  return makeConstrData(0, [
    buildMPTProofData(mpt_proof),
    buildHandleData(handle),
    makeIntData(amount),
  ]);
};

const buildMintingDataV1MintOrBurnRedeemer = (proofs: Proof[]): UplcData => {
  return makeConstrData(0, [makeListData(proofs.map(buildProofData))]);
};

const buildMintingDataV1GodModeRedeemer = (): UplcData => {
  return makeConstrData(1, []);
};

export {
  buildMintingDataV1GodModeRedeemer,
  buildMintingDataV1MintOrBurnRedeemer,
};
