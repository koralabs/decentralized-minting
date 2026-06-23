import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import { describe, expect, it } from "vitest";

import { buildBurnProofs, type BurnHandle } from "../src/txs/burnProofs.js";

const burnHandle = (utf8Name: string, extra: Partial<BurnHandle> = {}): BurnHandle => ({
  utf8Name,
  hexName: Buffer.from(utf8Name, "utf8").toString("hex"),
  isVirtual: false,
  ...extra,
});

describe("buildBurnProofs (mirrors all_burn_proofs_are_valid trie maintenance)", () => {
  it("nft/root burn: deletes the key; BurnProof carries handle_name + is_virtual", async () => {
    const db = new Trie();
    await db.insert("alice", ""); // the handle to burn
    await db.insert("bob", ""); // an unrelated key that must survive

    const proofs = await buildBurnProofs(db, [burnHandle("alice", { isVirtual: false })]);

    expect(proofs).toHaveLength(1);
    expect(proofs[0].handle_name).toBe(Buffer.from("alice", "utf8").toString("hex"));
    expect(proofs[0].is_virtual).toBe(0n);

    // the trie now equals one holding only "bob"
    const expected = new Trie();
    await expected.insert("bob", "");
    expect(db.hash.toString("hex")).toBe(expected.hash.toString("hex"));
  });

  it("virtual burn sets is_virtual=1", async () => {
    const db = new Trie();
    await db.insert("sub@root", "");
    const proofs = await buildBurnProofs(db, [burnHandle("sub@root", { isVirtual: true })]);
    expect(proofs[0].is_virtual).toBe(1n);
  });
});
