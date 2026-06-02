import { describe, expect, it } from "vitest";

import {
  buildMintingDataBurnLegacyHandlesRedeemer,
  buildMintingDataMintLabelAssetsRedeemer,
  buildMintingDataMintLegacyHandlesRedeemer,
  buildMintingDataMintNewHandlesRedeemer,
  buildMintingDataUpdateMPTRedeemer,
  plutusDataToCbor,
} from "../src/contracts/index.js";

// Constr-tagged CBOR prefixes: constr N (0..6) -> tag 121+N -> 0xd8 0x79+N.
//   0 -> d879, 1 -> d87a, 2 -> d87b, 3 -> d87c, 4 -> d87d
const tag = (n: number) => `d8${(0x79 + n).toString(16)}`;

// These indices ARE the on-chain ABI (validators/demimntmpt.ak MintingDataRedeemer order).
// New variants were appended after UpdateMPT so 0..2 are preserved.
describe("MintingDataRedeemer constructor indices match on-chain ABI", () => {
  it("MintNewHandles = 0", () => {
    expect(
      plutusDataToCbor(buildMintingDataMintNewHandlesRedeemer([], 0n)),
    ).toMatch(new RegExp(`^${tag(0)}`));
  });

  it("MintLegacyHandles = 1", () => {
    expect(
      plutusDataToCbor(buildMintingDataMintLegacyHandlesRedeemer([])),
    ).toMatch(new RegExp(`^${tag(1)}`));
  });

  it("UpdateMPT = 2", () => {
    expect(plutusDataToCbor(buildMintingDataUpdateMPTRedeemer())).toMatch(
      new RegExp(`^${tag(2)}`),
    );
  });

  it("BurnLegacyHandles = 3 (WS2)", () => {
    expect(
      plutusDataToCbor(buildMintingDataBurnLegacyHandlesRedeemer([])),
    ).toMatch(new RegExp(`^${tag(3)}`));
  });

  it("MintLabelAssets = 4 (WS1)", () => {
    expect(
      plutusDataToCbor(buildMintingDataMintLabelAssetsRedeemer([], 0n)),
    ).toMatch(new RegExp(`^${tag(4)}`));
  });
});
