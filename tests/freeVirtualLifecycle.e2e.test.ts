import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import { describe, expect, it } from "vitest";

import { valueBuffer } from "../src/store/labelSet.js";
import {
  addFreeName,
  encode,
  hasFreeName,
  hasFreeSlot,
  removeFreeName,
} from "../src/store/registryValue.js";
import { buildBurnProofs } from "../src/txs/burnProofs.js";
import { buildOrderProofs } from "../src/txs/orderProofs.js";

// DSH-405 — end-to-end free-virtual lifecycle against a REAL Trie, tying together the allowance
// rules (registryValue), the mint build (orderProofs), and the burn build (burnProofs). This
// simulates the engine's per-order free-vs-paid decision (which the contract enforces) so the
// whole free-virtual story is exercised: free under the allowance, paid over it, public never free,
// reopen-on-burn, and nft mint+burn — deferred here from the contract-side DSH-103/203.

const COUNT = 3; // free_virtual_count
const LABELS = ""; // root has no label set in these scenarios
const hex = (s: string) => Buffer.from(s, "utf8").toString("hex");

// A tiny in-test model of the engine's order-by-order tracking of a single root's free-name set.
class RootModel {
  freeNames: string[] = [];
  constructor(
    private db: Trie,
    readonly rootUtf8: string,
  ) {}

  async init() {
    // root pre-exists at encode([], labels)
    await this.db.insert(this.rootUtf8, valueBuffer(encode(this.freeNames, LABELS)));
  }

  // Mint a PRIVATE virtual sub. Free while a slot is open (bumps the set), else paid (untouched).
  async mintPrivateVirtual(subUtf8: string): Promise<"free" | "paid"> {
    const free = hasFreeSlot(this.freeNames, COUNT);
    await buildOrderProofs(this.db, [
      {
        utf8Name: subUtf8,
        hexName: hex(subUtf8),
        destinationAddress: "addr_test1_unused",
        minterFee: 0n,
        treasuryFee: 0n,
        isVirtual: true,
        freeVirtual: free
          ? { rootFreeNames: [...this.freeNames], rootLabels: LABELS }
          : undefined,
      },
    ]);
    if (free) this.freeNames = addFreeName(this.freeNames, hex(subUtf8.split("@")[0]));
    return free ? "free" : "paid";
  }

  // Mint a PUBLIC virtual sub — never consumes the allowance (always paid; set untouched).
  async mintPublicVirtual(subUtf8: string) {
    await buildOrderProofs(this.db, [
      {
        utf8Name: subUtf8,
        hexName: hex(subUtf8),
        destinationAddress: "addr_test1_unused",
        minterFee: 0n,
        treasuryFee: 0n,
        isVirtual: true,
        // public => no freeVirtual, ever
      },
    ]);
  }

  // Burn a virtual sub. If its name is in the free set, the burn reopens the slot.
  async burnVirtual(subUtf8: string) {
    const subHex = hex(subUtf8.split("@")[0]);
    const isFree = hasFreeName(this.freeNames, subHex);
    await buildBurnProofs(this.db, [
      {
        utf8Name: subUtf8,
        hexName: hex(subUtf8),
        isVirtual: true,
        freeVirtual: isFree
          ? { rootFreeNames: [...this.freeNames], rootLabels: LABELS }
          : undefined,
      },
    ]);
    if (isFree) this.freeNames = removeFreeName(this.freeNames, subHex);
  }
}

describe("free-virtual lifecycle e2e (registryValue + orderProofs + burnProofs, real Trie)", () => {
  it("first N private virtuals are free; the next is paid; reopen-on-burn frees a slot again", async () => {
    const db = new Trie();
    const root = new RootModel(db, "myroot");
    await root.init();

    // first 3 private virtuals are free
    expect(await root.mintPrivateVirtual("a@myroot")).toBe("free");
    expect(await root.mintPrivateVirtual("b@myroot")).toBe("free");
    expect(await root.mintPrivateVirtual("c@myroot")).toBe("free");
    expect(hasFreeSlot(root.freeNames, COUNT)).toBe(false);
    // addFreeName prepends, so the set is [c, b, a]
    expect(root.freeNames).toEqual([hex("c"), hex("b"), hex("a")]);

    // the 4th private virtual is over the allowance -> paid (set untouched)
    expect(await root.mintPrivateVirtual("d@myroot")).toBe("paid");
    expect(root.freeNames).toEqual([hex("c"), hex("b"), hex("a")]);

    // burning a FREE virtual reopens a slot
    await root.burnVirtual("b@myroot");
    expect(hasFreeName(root.freeNames, hex("b"))).toBe(false);
    expect(hasFreeSlot(root.freeNames, COUNT)).toBe(true);

    // the freed slot can be re-minted as free again
    expect(await root.mintPrivateVirtual("e@myroot")).toBe("free");

    // trie sanity: reconstruct the expected end state independently and compare roots.
    // remaining keys: root (at encode([e,c,a], labels)) + d@myroot (paid) + a/c/e@myroot
    const expected = new Trie();
    await expected.insert(
      "myroot",
      valueBuffer(encode([hex("e"), hex("c"), hex("a")], LABELS)),
    );
    await expected.insert("a@myroot", "");
    await expected.insert("c@myroot", "");
    await expected.insert("d@myroot", "");
    await expected.insert("e@myroot", "");
    expect(db.hash.toString("hex")).toBe(expected.hash.toString("hex"));
  });

  it("a public virtual never consumes the allowance", async () => {
    const db = new Trie();
    const root = new RootModel(db, "myroot");
    await root.init();

    await root.mintPublicVirtual("pub@myroot");
    expect(root.freeNames).toEqual([]); // untouched
    expect(hasFreeSlot(root.freeNames, COUNT)).toBe(true);

    // a public virtual burn likewise leaves the set untouched (no freeVirtual)
    await root.burnVirtual("pub@myroot");
    expect(root.freeNames).toEqual([]);

    // only the (unchanged) root key remains
    const expected = new Trie();
    await expected.insert("myroot", valueBuffer(encode([], LABELS)));
    expect(db.hash.toString("hex")).toBe(expected.hash.toString("hex"));
  });

  it("nft sub mint then burn returns the trie to its starting state", async () => {
    const db = new Trie();
    await db.insert("myroot", ""); // some pre-existing key so the trie is never empty
    const startHash = db.hash.toString("hex");

    // nft sub: no free-virtual involvement (isVirtual false, no freeVirtual)
    await buildOrderProofs(db, [
      {
        utf8Name: "nft@myroot",
        hexName: hex("nft@myroot"),
        destinationAddress: "addr_test1_unused",
        minterFee: 0n,
        treasuryFee: 0n,
        isVirtual: false,
      },
    ]);
    expect(db.hash.toString("hex")).not.toBe(startHash);

    await buildBurnProofs(db, [
      { utf8Name: "nft@myroot", hexName: hex("nft@myroot"), isVirtual: false },
    ]);
    expect(db.hash.toString("hex")).toBe(startHash);
  });
});
