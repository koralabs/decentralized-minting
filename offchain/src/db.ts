import { Store, Trie } from "@aiken-lang/merkle-patricia-forestry";
import { promises as fs } from "fs";

export async function init(folder: string) {
  const db = new Trie(new Store(folder));
  await db.save();
  return db;
}

export async function inspect(db: any) {
  console.log(db);
}

export async function clear(folder: string) {
  await fs.rm(folder, { recursive: true });
}
