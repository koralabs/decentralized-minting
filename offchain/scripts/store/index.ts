import { Store, Trie } from "@aiken-lang/merkle-patricia-forestry";
import fs from "fs/promises";

const init = async (folder: string): Promise<Trie> => {
  const db = new Trie(new Store(folder));
  // @ts-expect-error: Library issue
  await db.save();
  return db;
};

const inspect = async (db: Trie) => {
  console.log(db);
};

const clear = async (folder: string) => {
  await fs.rm(folder, { recursive: true });
};

const fillHandles = async (
  db: Trie,
  handles: string[],
  progress: () => void
) => {
  for (const handle of handles) {
    await db.insert(handle, "LEGACY");
    progress();
  }
  console.log(db);
};

const addHandle = async (db: Trie, key: string, value: string) => {
  await db.insert(key, value);
  console.log(db);
};

const removeHandle = async (db: Trie, key: string) => {
  await db.delete(key);
  console.log(db);
};

const printProof = async (
  db: Trie,
  key: string,
  format: "json" | "cborHex"
) => {
  const proof = await db.prove(key);
  switch (format) {
    case "json":
      console.log(proof.toJSON());
      break;
    case "cborHex":
      console.log(proof.toCBOR().toString("hex"));
      break;
  }
};

export {
  addHandle,
  clear,
  fillHandles,
  init,
  inspect,
  printProof,
  removeHandle,
};
