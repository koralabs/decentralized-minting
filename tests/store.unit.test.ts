import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

describe("store helpers (in-memory, API-sourced — no disk)", () => {
  it("builds the trie from a handle list and mutates/proves in memory", async () => {
    vi.resetModules();

    const insertMock = vi.fn().mockResolvedValue(undefined);
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    const proveMock = vi.fn().mockResolvedValue({
      toJSON: () => ({ ok: true }),
      toCBOR: () => Buffer.from("abcd", "hex"),
    });
    // The built trie is whatever `Trie.fromList` returns — purely in-memory.
    const builtTrie = {
      insert: insertMock,
      delete: deleteMock,
      prove: proveMock,
    };
    const fromListMock = vi.fn().mockResolvedValue(builtTrie);

    class MockTrie {
      static fromList = fromListMock;
    }

    vi.doMock("@aiken-lang/merkle-patricia-forestry", () => ({
      Trie: MockTrie,
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { addHandle, buildTrie, fillHandles, inspect, printProof, removeHandle } =
      await import("../src/store/index.js");

    // buildTrie is API-only sourced: `Trie.fromList` over {key,value} pairs,
    // never a disk `Store`.
    const db = await buildTrie(["a", "b"]);
    expect(fromListMock).toHaveBeenCalledWith([
      { key: "a", value: "" },
      { key: "b", value: "" },
    ]);

    await inspect(db as never);
    expect(logSpy).toHaveBeenCalled();

    const progress = vi.fn();
    await fillHandles(db as never, ["c", "d"], progress);
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledTimes(2);

    await addHandle(db as never, "e", "value");
    expect(insertMock).toHaveBeenCalledWith("e", "value");

    await removeHandle(db as never, "e");
    expect(deleteMock).toHaveBeenCalledWith("e");

    await printProof(db as never, "a", "json");
    await printProof(db as never, "a", "cborHex");
    expect(proveMock).toHaveBeenCalledTimes(2);
  });

  it("source has NO disk-backed Store or fs coupling (API-only law guard)", () => {
    // Enforces the design law in CI: the handle MPT is built in-memory from
    // the API, never persisted to / loaded from disk. If a disk `Store` or
    // `fs` import is reintroduced into store/index.ts (as automated self-fix
    // PR #43 attempted), this fails — "this should not happen again."
    const srcPath = fileURLToPath(
      new URL("../src/store/index.ts", import.meta.url),
    );
    const src = readFileSync(srcPath, "utf8");
    expect(src).not.toMatch(/new Store\(/);
    expect(src).not.toMatch(/from ["']fs/);
  });
});
