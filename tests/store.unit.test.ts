import { describe, expect, it, vi } from "vitest";

describe("store helpers", () => {
  it("loads an existing trie store before mutating it", async () => {
    vi.resetModules();

    const saveMock = vi.fn().mockResolvedValue(undefined);
    const insertMock = vi.fn().mockResolvedValue(undefined);
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    const proveMock = vi.fn().mockResolvedValue({
      toJSON: () => ({ ok: true }),
      toCBOR: () => Buffer.from("abcd", "hex"),
    });
    const loadedTrie = {
      hash: Buffer.from("11".repeat(32), "hex"),
      isEmpty: vi.fn().mockReturnValue(false),
      save: saveMock,
      insert: insertMock,
      delete: deleteMock,
      prove: proveMock,
    };
    const trieLoadMock = vi.fn().mockResolvedValue(loadedTrie);
    const rmMock = vi.fn().mockResolvedValue(undefined);

    class MockStore {
      folder: string;
      ready = vi.fn().mockResolvedValue(undefined);
      constructor(folder: string) {
        this.folder = folder;
      }
    }

    class MockTrie {
      hash: Buffer;
      constructor(_store: MockStore) {
        this.hash = Buffer.alloc(32);
      }
      static load = trieLoadMock;
      isEmpty = vi.fn().mockReturnValue(true);
      save = saveMock;
      insert = insertMock;
      delete = deleteMock;
      prove = proveMock;
    }

    vi.doMock("@aiken-lang/merkle-patricia-forestry", () => ({
      Store: MockStore,
      Trie: MockTrie,
    }));
    vi.doMock("fs/promises", () => ({
      default: {
        rm: rmMock,
      },
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const {
      addHandle,
      clear,
      fillHandles,
      init,
      inspect,
      printProof,
      removeHandle,
    } = await import("../src/store/index.js");

    const db = await init("./tmp-db");
    expect(trieLoadMock).toHaveBeenCalledTimes(1);
    expect(saveMock).not.toHaveBeenCalled();
    expect(db).toBe(loadedTrie);

    await inspect(db as never);
    expect(logSpy).toHaveBeenCalled();

    const progress = vi.fn();
    await fillHandles(db as never, ["a", "b"], progress);
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledTimes(2);

    await addHandle(db as never, "c", "value");
    expect(insertMock).toHaveBeenCalledWith("c", "value");

    await removeHandle(db as never, "c");
    expect(deleteMock).toHaveBeenCalledWith("c");

    await printProof(db as never, "a", "json");
    await printProof(db as never, "a", "cborHex");
    expect(proveMock).toHaveBeenCalledTimes(2);

    await clear("./tmp-db");
    expect(rmMock).toHaveBeenCalledWith("./tmp-db", { recursive: true });
  });

  it("creates an empty trie when the store has no saved root", async () => {
    vi.resetModules();

    const saveMock = vi.fn().mockResolvedValue(undefined);
    const trieLoadMock = vi.fn().mockRejectedValue(
      Object.assign(new Error("NotFound"), { code: "LEVEL_NOT_FOUND" }),
    );

    class MockStore {
      folder: string;
      ready = vi.fn().mockResolvedValue(undefined);
      constructor(folder: string) {
        this.folder = folder;
      }
    }

    class MockTrie {
      hash: Buffer;
      constructor(_store: MockStore) {
        this.hash = Buffer.alloc(32);
      }
      static load = trieLoadMock;
      isEmpty = vi.fn().mockReturnValue(true);
      save = saveMock;
    }

    vi.doMock("@aiken-lang/merkle-patricia-forestry", () => ({
      Store: MockStore,
      Trie: MockTrie,
    }));

    const { init } = await import("../src/store/index.js");

    const db = await init("./tmp-db");
    expect(trieLoadMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(db.hash.toString("hex")).toBe(Buffer.alloc(32).toString("hex"));
  });
});
