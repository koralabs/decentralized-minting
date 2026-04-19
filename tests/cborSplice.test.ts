import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  locateWitnessSet,
  mergeVkeysIntoTxCbor,
  skipCborItem,
  spliceVkeysIntoWitnessSet,
} from "../src/helpers/cardano-sdk/cborSplice.js";

const hex = (s: string) => Buffer.from(s, "hex");

describe("skipCborItem", () => {
  it("skips uint direct value", () => {
    expect(skipCborItem(hex("00"), 0)).toBe(1);
    expect(skipCborItem(hex("17"), 0)).toBe(1);
  });

  it("skips uint 1-byte encoding", () => {
    expect(skipCborItem(hex("1818"), 0)).toBe(2);
  });

  it("skips uint 2/4/8-byte encodings", () => {
    expect(skipCborItem(hex("190064"), 0)).toBe(3);
    expect(skipCborItem(hex("1a00010000"), 0)).toBe(5);
    expect(skipCborItem(hex("1b0000000000989680"), 0)).toBe(9);
  });

  it("skips definite byte string", () => {
    expect(skipCborItem(hex("4161"), 0)).toBe(2);
    expect(skipCborItem(hex("446869686f"), 0)).toBe(5);
  });

  it("skips definite text string", () => {
    expect(skipCborItem(hex("6461626364"), 0)).toBe(5);
  });

  it("skips definite-length array", () => {
    expect(skipCborItem(hex("83010203"), 0)).toBe(4);
  });

  it("skips definite-length map", () => {
    expect(skipCborItem(hex("a201020304"), 0)).toBe(5);
  });

  it("skips indefinite-length array", () => {
    expect(skipCborItem(hex("9f0102ff"), 0)).toBe(4);
  });

  it("skips tag", () => {
    expect(skipCborItem(hex("d87980"), 0)).toBe(3);
  });

  it("throws on reserved additional info", () => {
    expect(() => skipCborItem(hex("1c"), 0)).toThrow(/Unsupported CBOR/);
  });
});

describe("locateWitnessSet", () => {
  it("locates empty body + empty ws", () => {
    const txBytes = hex("84a0a0f5f6");
    const { start, end } = locateWitnessSet(txBytes);
    expect(start).toBe(2);
    expect(end).toBe(3);
  });
});

describe("spliceVkeysIntoWitnessSet", () => {
  it("returns sig-only when ws is empty", () => {
    const sigOnly =
      "a10181" +
      "82" +
      "58" +
      "20" +
      "11".repeat(32) +
      "58" +
      "40" +
      "22".repeat(64);
    expect(spliceVkeysIntoWitnessSet(hex("a0"), sigOnly)).toBe(sigOnly);
  });

  it("drops the stale key=0 entry from the original ws", () => {
    // ws = { 0: [1] }
    const orig = hex("a1008101");
    const sigOnly = "a1" + "00" + "81" + "44" + "deadbeef";
    const merged = spliceVkeysIntoWitnessSet(orig, sigOnly);
    expect(merged).toBe("a1" + "00" + "81" + "44" + "deadbeef");
  });

  it("preserves non-vkey entries byte-for-byte", () => {
    // ws = { 0: [1], 3: [h'cafe'] }
    const orig = hex("a2" + "00" + "81" + "01" + "03" + "81" + "42" + "cafe");
    const sigOnly = "a1" + "00" + "81" + "42" + "beef";
    const merged = spliceVkeysIntoWitnessSet(orig, sigOnly);
    expect(merged).toBe(
      "a2" + "00" + "81" + "42" + "beef" + "03" + "81" + "42" + "cafe",
    );
  });
});

describe("mergeVkeysIntoTxCbor", () => {
  it("merges vkeys into a full tx CBOR while preserving other bytes", () => {
    // tx = [body={}, ws={ 3: [h'cafe'] }, is_valid=true, aux=null]
    const tx =
      "84" + "a0" + ("a1" + "03" + "81" + "42" + "cafe") + "f5" + "f6";
    const sigOnly = "a1" + "00" + "81" + "42" + "beef";
    const merged = mergeVkeysIntoTxCbor(tx, sigOnly);
    // body and is_valid/aux untouched, ws now has key 0 then key 3
    expect(merged).toBe(
      "84" +
        "a0" +
        ("a2" + "00" + "81" + "42" + "beef" + "03" + "81" + "42" + "cafe") +
        "f5" +
        "f6",
    );
  });
});
