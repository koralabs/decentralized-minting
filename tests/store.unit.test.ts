import { describe, expect, it, vi } from "vitest";

describe("store helpers", () => {
  it("initializes, mutates, and clears trie store", async () => {
    vi.resetModules();

    const saveMock = vi.fn().mockResolvedValue(undefined);
    const insertMock = vi.fn().mockResolvedValue(undefined);
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    const proveMock = vi.fn().mockResolvedValue({
      toJSON: () => ({ ok: true }),
      toCBOR: () => Buffer.from("abcd", "hex"),
    });
    const trieLoadMock = vi.fn().mockResolvedValue({ loaded: true });
    const rmMock = vi.fn().mockResolvedValue(undefined);

    class MockStore {
      folder: string;
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
    expect(saveMock).toHaveBeenCalledTimes(1);

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
});
