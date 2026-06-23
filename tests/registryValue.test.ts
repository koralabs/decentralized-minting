import { describe, expect, it } from "vitest";

import { encode } from "../src/store/registryValue.js";

const LABEL_001 = "00001070";

describe("registryValue.encode (byte-identical to on-chain registry_value.encode)", () => {
  it("empty -> empty value", () => {
    expect(encode("")).toBe("");
  });

  it("labels -> the label set itself (identity)", () => {
    expect(encode(LABEL_001)).toBe(LABEL_001);
    expect(encode("00001070000020e0")).toBe("00001070000020e0");
  });

  it("normalizes to lowercase", () => {
    expect(encode("0000FF")).toBe("0000ff");
  });
});
