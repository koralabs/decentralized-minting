import { describe, expect, it } from "vitest";

import {
  buildMintingDataBurnDeMiHandlesRedeemer,
  buildMintingDataBurnLegacyHandlesRedeemer,
  buildMintingDataMintDeMiHandlesRedeemer,
  buildMintingDataMintLabelAssetsRedeemer,
  buildMintingDataMintLegacyHandlesRedeemer,
  buildMintingDataUpdateMPTRedeemer,
  buildOrderProofData,
  type BurnProof,
  type OrderProof,
  plutusDataToCbor,
} from "../src/contracts/index.js";

// Constr-tagged CBOR prefixes: constr N (0..6) -> tag 121+N -> 0xd8 0x79+N.
//   0 -> d879, 1 -> d87a, 2 -> d87b, 3 -> d87c, 4 -> d87d, 5 -> d87e
const tag = (n: number) => `d8${(0x79 + n).toString(16)}`;

// These indices ARE the on-chain ABI (validators/demimntmpt.ak MintingDataRedeemer order).
// New variants were appended after UpdateMPT so 0..2 are preserved.
describe("MintingDataRedeemer constructor indices match on-chain ABI", () => {
  it("MintDeMiHandles = 0", () => {
    expect(
      plutusDataToCbor(buildMintingDataMintDeMiHandlesRedeemer([], 0n)),
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

  it("BurnDeMiHandles = 5 (DeMi burn)", () => {
    expect(
      plutusDataToCbor(buildMintingDataBurnDeMiHandlesRedeemer([])),
    ).toMatch(new RegExp(`^${tag(5)}`));
  });
});

// The proof/redeemer ABI must match validations/minting_data/types.ak field-for-field — the
// validator decodes these positionally, so a wrong constructor index or field count fails on-chain.
describe("OrderProof encoding (matches OrderProof field order)", () => {
  // a minimal MPT proof (empty step list) — enough to exercise the OrderProof field layout
  const emptyProof: OrderProof["mpt_proof"] = [];

  it("order encodes constr 0 [ mpt_proof ]", () => {
    const order: OrderProof = { mpt_proof: emptyProof };
    const cbor = plutusDataToCbor(buildOrderProofData(order));
    // OrderProof = constr0 [ mpt_proof (empty list 0x80) ].
    //   d879 9f | 80 | ff
    expect(cbor).toBe(`${tag(0)}9f80ff`);
  });
});

describe("BurnProof encoding (matches BurnProof field order)", () => {
  it("nft/root burn (no root_absence) = constr 0 [proof, name, is_virtual, None]", () => {
    const burn: BurnProof = {
      mpt_proof: [],
      handle_name: "6162",
      is_virtual: 0n,
    };
    const cbor = plutusDataToCbor(buildMintingDataBurnDeMiHandlesRedeemer([burn]));
    // BurnDeMiHandles=constr5 [ list[ BurnProof=constr0 [ 80(proof), h'6162'=426162,
    //   is_virtual 0=00, root_absence None=d87a80 ] ] ]
    //   d87e 9f | 9f | d879 9f | 80 426162 00 d87a80 | ff | ff | ff
    expect(cbor).toBe(`${tag(5)}9f9f${tag(0)}9f8042616200${tag(1)}80ffffff`);
  });
});
