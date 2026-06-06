import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import { describe, expect, it } from "vitest";

import type { NewHandle } from "../src/contracts/index.js";
import { valueBuffer } from "../src/store/labelSet.js";
import { encode } from "../src/store/registryValue.js";
import { buildBurnProofs,type BurnHandle } from "../src/txs/burnProofs.js";
import { buildOrderProofs } from "../src/txs/orderProofs.js";

const LBL_001 = "00001070";
const OLD_NAME = "6f6c64"; // a pre-existing free name in the root's set

const burnHandle = (utf8Name: string, extra: Partial<BurnHandle> = {}): BurnHandle => ({
  utf8Name,
  hexName: Buffer.from(utf8Name, "utf8").toString("hex"),
  isVirtual: false,
  ...extra,
});

const newHandle = (utf8Name: string, extra: Partial<NewHandle> = {}): NewHandle => ({
  utf8Name,
  hexName: Buffer.from(utf8Name, "utf8").toString("hex"),
  destinationAddress: "addr_test1_unused",
  minterFee: 0n,
  treasuryFee: 0n,
  ...extra,
});

describe("buildBurnProofs (mirrors all_burn_proofs_are_valid trie maintenance)", () => {
  it("nft/root burn: deletes the key; BurnProof carries handle_name + is_virtual, no free_virtual", async () => {
    const db = new Trie();
    await db.insert("alice", ""); // the handle to burn
    await db.insert("bob", ""); // an unrelated key that must survive

    const proofs = await buildBurnProofs(db, [burnHandle("alice", { isVirtual: false })]);

    expect(proofs).toHaveLength(1);
    expect(proofs[0].handle_name).toBe(Buffer.from("alice", "utf8").toString("hex"));
    expect(proofs[0].is_virtual).toBe(0n);
    expect(proofs[0].free_virtual).toBeUndefined();

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

  it("free private virtual burn: deletes the sub AND removes its name from the root's free set", async () => {
    // root holds two free names; we burn the sub whose name is "sub"
    const subHex = Buffer.from("sub", "utf8").toString("hex");
    const db = new Trie();
    await db.insert("myroot", valueBuffer(encode([subHex, OLD_NAME], LBL_001)));
    await db.insert("sub@myroot", "");

    const proofs = await buildBurnProofs(db, [
      burnHandle("sub@myroot", {
        isVirtual: true,
        freeVirtual: { rootFreeNames: [subHex, OLD_NAME], rootLabels: LBL_001 },
      }),
    ]);

    expect(proofs[0].free_virtual?.root_free_names).toEqual([subHex, OLD_NAME]);

    // resulting trie == root at encode([OLD_NAME], labels) (sub name removed), sub key gone
    const expected = new Trie();
    await expected.insert("myroot", valueBuffer(encode([OLD_NAME], LBL_001)));
    expect(db.hash.toString("hex")).toBe(expected.hash.toString("hex"));
  });

  it("free-virtual mint then burn returns the trie to its exact starting state (burn = inverse of mint)", async () => {
    // start: root with one existing free name + a label set; sub not yet minted
    const db = new Trie();
    await db.insert("myroot", valueBuffer(encode([OLD_NAME], LBL_001)));
    const startHash = db.hash.toString("hex");

    // mint a free private virtual "sub@myroot" (inserts sub key + bumps root free_names)
    await buildOrderProofs(db, [
      newHandle("sub@myroot", {
        isVirtual: true,
        freeVirtual: { rootFreeNames: [OLD_NAME], rootLabels: LBL_001 },
      }),
    ]);
    expect(db.hash.toString("hex")).not.toBe(startHash);

    // burn it back (deletes sub key + removes its free name) — the root set after the mint is
    // [sub, OLD_NAME], which is what the burn proof must reference
    const subHex = Buffer.from("sub", "utf8").toString("hex");
    await buildBurnProofs(db, [
      burnHandle("sub@myroot", {
        isVirtual: true,
        freeVirtual: { rootFreeNames: [subHex, OLD_NAME], rootLabels: LBL_001 },
      }),
    ]);

    expect(db.hash.toString("hex")).toBe(startHash);
  });

  it("rejects free_virtual on a non-sub handle", async () => {
    const db = new Trie();
    await db.insert("rootonly", "");
    await expect(
      buildBurnProofs(db, [
        burnHandle("rootonly", { isVirtual: true, freeVirtual: { rootFreeNames: [], rootLabels: "" } }),
      ]),
    ).rejects.toThrow();
  });
});
