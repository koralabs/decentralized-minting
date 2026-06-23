import { Trie } from "@aiken-lang/merkle-patricia-forestry";

import { type BurnProof, parseMPTProofJSON } from "../contracts/index.js";

/** One DeMi-policy handle to burn (root, nft sub, or virtual sub). */
export interface BurnHandle {
  /** Handle name (UTF-8) — the MPT key. */
  utf8Name: string;
  /** Handle name (hex, without asset-name label) — the BurnProof's handle_name. */
  hexName: string;
  /** Virtual sub (000) vs nft/root (100+222). */
  isVirtual: boolean;
}

/**
 * DSH-404 — build the per-handle `BurnProof`s for a DeMi `BurnDeMiHandles` tx, advancing the local
 * trie exactly as the contract's `all_burn_proofs_are_valid` does (the inverse of
 * `buildOrderProofs`):
 *
 *  1. Prove the handle's OWN key is present, then `mpt.delete` it (value `#""`) — existence-before,
 *     absence-after.
 *
 * Mutates `db`; callers read `db.hash` afterwards for the new minting-data root.
 */
export const buildBurnProofs = async (
  db: Trie,
  handles: BurnHandle[],
): Promise<BurnProof[]> => {
  const proofs: BurnProof[] = [];
  for (const handle of handles) {
    const { utf8Name, hexName, isVirtual } = handle;
    // prove the key is present, then delete it
    const subProof = await db.prove(utf8Name);
    await db.delete(utf8Name);

    proofs.push({
      mpt_proof: parseMPTProofJSON(subProof.toJSON()),
      handle_name: hexName,
      is_virtual: isVirtual ? 1n : 0n,
    });
  }
  return proofs;
};
