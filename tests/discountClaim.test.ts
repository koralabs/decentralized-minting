import { describe, expect, it } from "vitest";

import {
  buildDiscountClaimData,
  decodeDiscountClaimInfo,
} from "../src/contracts/data/discount.js";
import { plutusDataToCbor } from "../src/contracts/data/plutusData.js";

// Constr-tagged CBOR prefixes: constr N -> tag 121+N -> 0xd8 0x79+N.
const tag = (n: number) => `d8${(0x79 + n).toString(16)}`;

// Indices ARE the on-chain ABI (discount.ak DiscountClaim declaration order).
describe("DiscountClaim constructor indices match discount.ak", () => {
  it("RarityClaim = 0", () => {
    expect(
      plutusDataToCbor(buildDiscountClaimData({ type: "rarity", handle_name: "6162" })),
    ).toMatch(new RegExp(`^${tag(0)}`));
  });

  it("OgClaim = 1", () => {
    expect(
      plutusDataToCbor(buildDiscountClaimData({ type: "og", handle_name: "616c696365" })),
    ).toMatch(new RegExp(`^${tag(1)}`));
  });

  it("PartnerClaim = 2", () => {
    expect(
      plutusDataToCbor(
        buildDiscountClaimData({
          type: "partner",
          policy_id: "be".repeat(28),
          asset_name: "70",
          value: "00",
          proof: [],
        }),
      ),
    ).toMatch(new RegExp(`^${tag(2)}`));
  });

  it("HalClaim = 3", () => {
    expect(
      plutusDataToCbor(buildDiscountClaimData({ type: "hal", asset_name: "68" })),
    ).toMatch(new RegExp(`^${tag(3)}`));
  });
});

describe("decodeDiscountClaimInfo round-trips the identity", () => {
  it("rarity / og / hal", () => {
    expect(decodeDiscountClaimInfo(buildDiscountClaimData({ type: "rarity", handle_name: "6162" }))).toEqual({ type: "rarity", handle_name: "6162" });
    expect(decodeDiscountClaimInfo(buildDiscountClaimData({ type: "og", handle_name: "616c696365" }))).toEqual({ type: "og", handle_name: "616c696365" });
    expect(decodeDiscountClaimInfo(buildDiscountClaimData({ type: "hal", asset_name: "68" }))).toEqual({ type: "hal", asset_name: "68" });
  });

  it("partner (policy + asset name, proof omitted)", () => {
    const data = buildDiscountClaimData({ type: "partner", policy_id: "be".repeat(28), asset_name: "70", value: "00", proof: [] });
    expect(decodeDiscountClaimInfo(data)).toEqual({ type: "partner", policy_id: "be".repeat(28), asset_name: "70" });
  });
});
