import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import { describe, expect, it } from "vitest";

import type { NewHandle } from "../src/contracts/index.js";
import { valueBuffer } from "../src/store/labelSet.js";
import { addFreeName, encode } from "../src/store/registryValue.js";
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

const LBL_001 = "00001070";
const SUB_HEX = Buffer.from("sub", "utf8").toString("hex"); // "737562"
const OLD_NAME = "6f6c64"; // a pre-existing free name in the root's set

describe("buildOrderProofs (mirrors all_orders_are_satisfied trie maintenance)", () => {
  it("paid order: inserts the sub key with empty value, free_virtual undefined", async () => {
    const db = new Trie();
    const proofs = await buildOrderProofs(db, [handle("alice", { isVirtual: false })]);

    expect(proofs).toHaveLength(1);
    expect(proofs[0].free_virtual).toBeUndefined();
    expect(Array.isArray(proofs[0].mpt_proof)).toBe(true);

    // the trie now equals one that simply has the key at empty value
    const expected = new Trie();
    await expected.insert("alice", "");
    expect(db.hash.toString("hex")).toBe(expected.hash.toString("hex"));
  });

  it("free private virtual: inserts sub key AND bumps the root's free-name set", async () => {
    // root "myroot" pre-exists holding one free name + a label set
    const oldRootValue = encode([OLD_NAME], LBL_001);
    const db = new Trie();
    await db.insert("myroot", valueBuffer(oldRootValue));

    const proofs = await buildOrderProofs(db, [
      handle("sub@myroot", {
        isVirtual: true,
        freeVirtual: { rootFreeNames: [OLD_NAME], rootLabels: LBL_001 },
      }),
    ]);

    // FreeVirtualData carries the OLD (pre-bump) names + labels the contract re-derives
    expect(proofs[0].free_virtual).toBeDefined();
    expect(proofs[0].free_virtual?.root_free_names).toEqual([OLD_NAME]);
    expect(proofs[0].free_virtual?.root_labels).toBe(LBL_001);
    expect(Array.isArray(proofs[0].free_virtual?.root_proof)).toBe(true);

    // the resulting trie == root at encode(addFreeName([old], "sub"), labels) + the sub key
    const newRootValue = encode(addFreeName([OLD_NAME], SUB_HEX), LBL_001);
    const expected = new Trie();
    await expected.insert("myroot", valueBuffer(newRootValue));
    await expected.insert("sub@myroot", "");
    expect(db.hash.toString("hex")).toBe(expected.hash.toString("hex"));
  });

  it("free-virtual root bump is the byte-exact inverse a burn would reopen (prepend ordering)", async () => {
    // the bumped root value must be encode([sub, ...old], labels) — prepend, matching the contract
    const newRootValue = encode(addFreeName([OLD_NAME], SUB_HEX), LBL_001);
    expect(newRootValue).toBe(encode([SUB_HEX, OLD_NAME], LBL_001));
  });

  it("rejects free_virtual on a non-sub (root) handle rather than mis-bump", async () => {
    const db = new Trie();
    await expect(
      buildOrderProofs(db, [
        handle("rootonly", {
          isVirtual: true,
          freeVirtual: { rootFreeNames: [], rootLabels: "" },
        }),
      ]),
    ).rejects.toThrow();
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
