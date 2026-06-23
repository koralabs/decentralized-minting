import { Trie } from "@aiken-lang/merkle-patricia-forestry";

import { type NewHandle, type OrderProof, parseMPTProofJSON } from "../contracts/index.js";

/**
 * DSH-403 — build the per-order `OrderProof`s for a DeMi `MintDeMiHandles` tx, advancing the local
 * trie exactly as the contract's `all_orders_are_satisfied` does so the on-chain `mpt` ops verify:
 *
 *  1. Insert the handle's OWN key with an empty value (`mpt.insert(root, handle, #"", proof)`), in
 *     order-input order. This is identical for root / nft sub / virtual sub — every mint inserts.
 *
 * Mutates `db`; callers read `db.hash` afterwards for the new minting-data root.
 */
export const buildOrderProofs = async (
  db: Trie,
  handles: NewHandle[],
): Promise<OrderProof[]> => {
  const proofs: OrderProof[] = [];
  for (const handle of handles) {
    const { utf8Name } = handle;
    // insert the handle's own key (empty value) and prove it
    await db.insert(utf8Name, "");
    const subProof = await db.prove(utf8Name);

    proofs.push({
      mpt_proof: parseMPTProofJSON(subProof.toJSON()),
    });
  }
  return proofs;
};
