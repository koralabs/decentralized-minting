export async function get_all_handles(): Promise<string[]> {
  const response = await fetch("https://api.handle.me/handles", {
    headers: {
      Accept: "text/plain",
    },
  });
  return (await response.text()).split("\n");
}
export async function fill_handles(
  db: any,
  handles: string[],
  progress: () => void,
) {
  for (const handle of handles) {
    await db.insert(handle, "LEGACY");
    progress();
  }
  console.log(db);
}
