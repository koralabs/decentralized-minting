import { describe, expect, it } from "vitest";

import { apply, contains, encodeRegistryValue, insert, remove } from "../src/store/labelSet.js";

// 001 = 00001070, 002 = 000020e0, 100 = 000643b0, 222 = 000de140
const LBL_001 = "00001070";
const LBL_002 = "000020e0";
const LBL_100 = "000643b0";

describe("labelSet (matches on-chain label_set.ak)", () => {
  it("contains", () => {
    expect(contains("", LBL_001)).toBe(false);
    expect(contains("00001070000020e0", LBL_002)).toBe(true);
    expect(contains("00001070000020e0", LBL_100)).toBe(false);
  });

  it("insert keeps canonical sorted order", () => {
    expect(insert("", LBL_001)).toBe(LBL_001);
    expect(insert("00001070", LBL_002)).toBe("00001070000020e0");
    // 002 sorts after 001: inserting 001 into {002} -> {001,002}
    expect(insert("000020e0", LBL_001)).toBe("00001070000020e0");
  });

  it("insert is order-independent (canonical)", () => {
    const a = insert(insert(insert("", LBL_100), LBL_001), LBL_002);
    const b = insert(insert(insert("", LBL_002), LBL_100), LBL_001);
    expect(a).toBe(b);
    expect(a).toBe("00001070000020e0000643b0");
  });

  it("insert duplicate throws", () => {
    expect(() => insert("00001070", LBL_001)).toThrow();
  });

  it("remove", () => {
    expect(remove("00001070", LBL_001)).toBe("");
    expect(remove("00001070000020e0", LBL_001)).toBe("000020e0");
    expect(remove("00001070000020e0", LBL_002)).toBe("00001070");
    expect(() => remove("00001070", LBL_002)).toThrow();
  });

  it("apply couples to mint(+1)/burn(-1)", () => {
    expect(apply("00001070", LBL_002, 1n)).toBe("00001070000020e0");
    expect(apply("00001070000020e0", LBL_002, -1n)).toBe("00001070");
    expect(() => apply("", LBL_001, 2n)).toThrow();
  });
});

describe("encodeRegistryValue (matches on-chain registry_value.encode)", () => {
  it("count 0 -> labels (backward compatible)", () => {
    expect(encodeRegistryValue(0n, "")).toBe("");
    expect(encodeRegistryValue(0n, "00001070")).toBe("00001070");
  });
  it("count > 0 -> 0xff + CBOR(count) + labels (byte-identical to aiken pins)", () => {
    expect(encodeRegistryValue(1n, "00001070")).toBe("ff0100001070");
    expect(encodeRegistryValue(3n, "")).toBe("ff03");
    expect(encodeRegistryValue(24n, "00001070")).toBe("ff181800001070");
  });
});
