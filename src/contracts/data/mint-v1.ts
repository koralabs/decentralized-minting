import { makeConstrData, UplcData } from "@helios-lang/uplc";

const buildMintV1MintHandlesRedeemer = (): UplcData => {
  return makeConstrData(0, []);
};

const buildMintV1BurnHandlesRedeemer = (): UplcData => {
  return makeConstrData(1, []);
};

export { buildMintV1BurnHandlesRedeemer, buildMintV1MintHandlesRedeemer };
