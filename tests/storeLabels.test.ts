import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildTrie, fillHandles } from "../src/store/index.js";

const handles = [
  { name: "alice", labels: "00001070000020e0" },
  { name: "bob", labels: "" },
];

afterEach(() => vi.restoreAllMocks());

describe("API-sourced label-aware trie helpers", () => {
  // Invariant: the trie contains the exact raw CIP-67 label bytes and proves them.
  // Negative control: discarding labels or inserting their UTF-8 hex changes the root.
  it("preserves labeled and unlabeled handle values in a real in-memory trie", async () => {
    const db = await buildTrie(handles);
    expect(await db.get("alice")).toEqual(Buffer.from("00001070000020e0", "hex"));
    expect(await db.get("bob")).toEqual(Buffer.alloc(0));
    const expected = await Trie.fromList([
      { key: "alice", value: Buffer.from("00001070000020e0", "hex") },
      { key: "bob", value: Buffer.alloc(0) },
    ]);
    expect(db.hash).toEqual(expected.hash);
    expect(db.hash.toString("hex")).toBe("ef84f39903c46336be5bc9ff8c873be7445551f45b4cefac27dbc8151754f2fd");
    expect((await db.prove("alice")).verify()).toEqual(expected.hash);
  });

  // Invariant: incremental insertion builds the same root as the full labeled set.
  // Negative control: fillHandles inserting empty values fails both value and root checks.
  it("preserves labels when filling the trie incrementally", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const db = await buildTrie([]);
    let completed = 0;
    await fillHandles(db, handles, () => completed++);
    expect(completed).toBe(2);
    expect(await db.get("alice")).toEqual(Buffer.from("00001070000020e0", "hex"));
    expect(db.hash).toEqual((await buildTrie(handles)).hash);
  });

  // Invariant: a duplicate cannot replace an existing handle's chain-derived labels.
  // Negative control: swallowing the failed insert or replacing the value breaks assertions.
  it("rejects a duplicate handle and retains the original root and value", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const db = await buildTrie(handles);
    const root = Buffer.from(db.hash);
    await expect(fillHandles(db, [{ name: "alice", labels: "" }], () => {})).rejects.toThrow();
    expect(db.hash).toEqual(root);
    expect(await db.get("alice")).toEqual(Buffer.from("00001070000020e0", "hex"));
  });
});

// API JSON needs runtime checks: TypeScript alone cannot protect chain-root inputs.
describe("registry entry validation", () => {
  const invalid = [
    { description: "names-only v3 input", entries: ["alice"] },
    { description: "repeated handle name", entries: [{ name: "charlie", labels: "00001070" }, { name: "charlie", labels: "000020e0" }] },
    { description: "missing labels", entries: [{ name: "alice" }] },
    { description: "null labels", entries: [{ name: "alice", labels: null }] },
    { description: "numeric labels", entries: [{ name: "alice", labels: 1070 }] },
    { description: "odd hex width", entries: [{ name: "alice", labels: "0000107" }] },
    { description: "incomplete second label", entries: [{ name: "alice", labels: "0000107000" }] },
    { description: "non-hex bytes", entries: [{ name: "alice", labels: "0000107g" }] },
    { description: "hex prefix", entries: [{ name: "alice", labels: "0x00001070" }] },
    { description: "unsorted labels", entries: [{ name: "alice", labels: "000020e000001070" }] },
    { description: "duplicate labels", entries: [{ name: "alice", labels: "0000107000001070" }] },
    { description: "missing name", entries: [{ labels: "" }] },
    { description: "empty name", entries: [{ name: "", labels: "" }] },
    { description: "null entry", entries: [null] },
    { description: "sparse input", entries: new Array(1) },
    { description: "non-array input", entries: null },
  ];

  it.each(invalid)("rejects $description before constructing or inserting", async ({ entries }) => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const input = entries as unknown as Parameters<typeof buildTrie>[0];
    await expect(buildTrie(input)).rejects.toThrow(/registry|labels/i);
    const db = await buildTrie(handles);
    const root = Buffer.from(db.hash);
    const progress = vi.fn();
    await expect(fillHandles(db, input, progress)).rejects.toThrow(/registry|labels/i);
    expect(db.hash).toEqual(root);
    expect(progress).not.toHaveBeenCalled();
  });

  it("validates the entire batch before mutating the trie", async () => {
    const db = await buildTrie(handles);
    const root = Buffer.from(db.hash);
    const progress = vi.fn();
    await expect(fillHandles(db, [
      { name: "charlie", labels: "00001070" },
      { name: "dana", labels: "0000107g" },
    ], progress)).rejects.toThrow(/labels/i);
    expect(db.hash).toEqual(root);
    expect(await db.get("charlie")).toBeUndefined();
    expect(progress).not.toHaveBeenCalled();
  });

  it("normalizes uppercase hex without changing the canonical bytes or root", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const uppercase = handles.map(({ name, labels }) => ({ name, labels: labels.toUpperCase() }));
    const expected = await buildTrie(handles);
    const db = await buildTrie(uppercase);
    expect(db.hash).toEqual(expected.hash);
    const filled = await buildTrie([]);
    await fillHandles(filled, uppercase, () => {});
    expect(filled.hash).toEqual(expected.hash);
  });

  it("accepts future four-byte labels allowed by the on-chain label set", async () => {
    const db = await buildTrie([{ name: "future", labels: "01abcdefabcdef01" }]);
    expect(await db.get("future")).toEqual(Buffer.from("01abcdefabcdef01", "hex"));
  });
});
