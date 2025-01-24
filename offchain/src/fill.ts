import { Trie } from "@aiken-lang/merkle-patricia-forestry";

export const get_all_handles = async (): Promise<string[]> => {
  const response = await fetch("https://api.handle.me/handles", {
    headers: {
      Accept: "text/plain",
    },
  });
  return (await response.text()).split("\n");
};
export const fill_handles = async (
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
