import { Store, Trie } from "@aiken-lang/merkle-patricia-forestry";
import fs from "fs/promises";

export const init = async (folder: string): Promise<Trie> => {
  const db = new Trie(new Store(folder));
  // @ts-expect-error: Library issue
  await db.save();
  return db;
};

export const inspect = async (db: Trie) => {
  console.log(db);
};

export const clear = async (folder: string) => {
  await fs.rm(folder, { recursive: true });
};
