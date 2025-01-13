export async function add_handle(db: any, key: string, value: string) {
  await db.insert(key, value);
  console.log(db);
}
export async function remove_handle(db: any, key: string) {
  await db.delete(key);
  console.log(db);
}
export async function print_proof(
  db: any,
  key: string,
  format: "json" | "cborHex",
) {
  const proof = await db.prove(key);
  switch (format) {
    case "json":
      console.log(proof.toJSON());
      break;
    case "cborHex":
      console.log(proof.toCBOR().toString("hex"));
      break;
  }
}
