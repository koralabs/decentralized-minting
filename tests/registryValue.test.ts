import { describe, expect, it } from "vitest";

import {
  addFreeName,
  encode,
  hasFreeName,
  hasFreeSlot,
  removeFreeName,
} from "../src/store/registryValue.js";

// The pinned hex below is CONFIRMED byte-identical to on-chain `registry_value.encode`: each
// vector was checked against aiken v1.0.29 `builtin.serialise_data` (see DSH-402). If the TS
// CBOR diverges by a single byte, these exact-hex assertions fail — which is the same failure the
// chain would surface as a rejected free-virtual `mpt.update`.
//
// serialise_data(["6162"])        = 9f 42 6162 ff
// serialise_data(["6364","6162"]) = 9f 42 6364 42 6162 ff
const NAME_AB = "6162"; // "ab"
const NAME_CD = "6364"; // "cd"
const LABEL_001 = "00001070";

describe("registryValue.encode (byte-identical to on-chain registry_value.encode)", () => {
  it("empty set -> labels (backward compatible with WS1)", () => {
    expect(encode([], "")).toBe("");
    expect(encode([], "00001070000020e0")).toBe("00001070000020e0");
  });

  it("non-empty set -> 0xff ++ serialise_data(free_names) ++ labels (pinned bytes)", () => {
    expect(encode([NAME_AB], LABEL_001)).toBe("ff9f426162ff00001070");
    expect(encode([NAME_CD, NAME_AB], LABEL_001)).toBe("ff9f426364426162ff00001070");
  });

  it("non-empty set differs from pure labels and carries the 0xff marker + label suffix", () => {
    const v = encode([NAME_AB], LABEL_001);
    expect(v).not.toBe(LABEL_001);
    expect(v.slice(0, 2)).toBe("ff");
    expect(v.slice(v.length - LABEL_001.length)).toBe(LABEL_001);
  });

  it("prepend order is part of the bytes (encode is order-sensitive)", () => {
    expect(encode([NAME_AB, NAME_CD], LABEL_001)).not.toBe(
      encode([NAME_CD, NAME_AB], LABEL_001),
    );
  });

  it("name >= 24 bytes uses the 0x58 ++ len byte-string header (pinned)", () => {
    const name24 = "61".repeat(24); // 24-byte name
    expect(encode([name24], LABEL_001)).toBe(`ff9f5818${name24}ff00001070`);
  });

  it("rejects an over-64-byte name rather than emit divergent bytes", () => {
    expect(() => encode(["61".repeat(65)], LABEL_001)).toThrow();
  });
});

describe("registryValue free-name helpers (mirror registry_value.ak)", () => {
  it("hasFreeSlot: first 3 are free, full once 3 held", () => {
    expect(hasFreeSlot([], 3)).toBe(true);
    expect(hasFreeSlot(["61", "62"], 3)).toBe(true);
    expect(hasFreeSlot(["61", "62", "63"], 3)).toBe(false);
  });

  it("addFreeName prepends and is idempotent", () => {
    expect(addFreeName([NAME_AB], NAME_CD)).toEqual([NAME_CD, NAME_AB]);
    expect(addFreeName([NAME_AB], NAME_AB)).toEqual([NAME_AB]);
  });

  it("removeFreeName reopens a slot; absent name is a no-op", () => {
    const after = removeFreeName(["61", "62", "63"], "62");
    expect(hasFreeName(after, "62")).toBe(false);
    expect(hasFreeSlot(after, 3)).toBe(true);
    expect(removeFreeName(["61", "62"], "99")).toEqual(["61", "62"]);
  });

  it("free-virtual mint then burn roundtrips the encoded root value (DSH-203 inverse)", () => {
    const start = [NAME_AB];
    const afterMint = addFreeName(start, NAME_CD);
    const afterBurn = removeFreeName(afterMint, NAME_CD);
    expect(encode(afterBurn, LABEL_001)).toBe(encode(start, LABEL_001));
    // and the mint actually moved the value
    expect(encode(afterMint, LABEL_001)).not.toBe(encode(start, LABEL_001));
  });
});
