import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import { describe, expect, it } from "vitest";

import type { NewHandle } from "../src/contracts/index.js";
import { buildOrderProofs } from "../src/txs/orderProofs.js";

// Minimal NewHandle factory (only the fields buildOrderProofs reads matter here).
const handle = (utf8Name: string, extra: Partial<NewHandle> = {}): NewHandle => ({
  utf8Name,
  hexName: Buffer.from(utf8Name, "utf8").toString("hex"),
  destinationAddress: "addr_test1_unused",
  minterFee: 0n,
  treasuryFee: 0n,
  ...extra,
});

describe("buildOrderProofs (mirrors all_orders_are_satisfied trie maintenance)", () => {
  it("order: inserts the handle key with empty value", async () => {
    const db = new Trie();
    const proofs = await buildOrderProofs(db, [handle("alice", { isVirtual: false })]);

    expect(proofs).toHaveLength(1);
    expect(Array.isArray(proofs[0].mpt_proof)).toBe(true);

    // the trie now equals one that simply has the key at empty value
    const expected = new Trie();
    await expected.insert("alice", "");
    expect(db.hash.toString("hex")).toBe(expected.hash.toString("hex"));
  });

  it("processes multiple orders in sequence, advancing the trie for each", async () => {
    const db = new Trie();
    const proofs = await buildOrderProofs(db, [
      handle("alice"),
      handle("bob", { isVirtual: true }),
    ]);
    expect(proofs).toHaveLength(2);

    const expected = new Trie();
    await expected.insert("alice", "");
    await expected.insert("bob", "");
    expect(db.hash.toString("hex")).toBe(expected.hash.toString("hex"));
  });
});
