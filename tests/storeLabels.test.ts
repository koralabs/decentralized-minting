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
