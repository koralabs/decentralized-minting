import { Trie } from "@aiken-lang/merkle-patricia-forestry";

import { type BurnProof, parseMPTProofJSON } from "../contracts/index.js";
import { valueBuffer } from "../store/labelSet.js";
import { encode as encodeRegistryValue, removeFreeName } from "../store/registryValue.js";
import { parseHandle } from "../utils/index.js";

/** One DeMi-policy handle to burn (root, nft sub, or virtual sub). */
export interface BurnHandle {
  /** Handle name (UTF-8) — the MPT key. */
  utf8Name: string;
  /** Handle name (hex, without asset-name label) — the BurnProof's handle_name. */
  hexName: string;
  /** Virtual sub (000) vs nft/root (100+222). */
  isVirtual: boolean;
  /**
   * Set ONLY when burning a FREE private virtual whose name is in the root's free set — reopens the
   * slot. Carries the root's CURRENT free-name set + label set (the engine supplies them); omit for
   * nft/root/public/paid burns (the allowance is left untouched).
   */
  freeVirtual?: {
    rootFreeNames: string[];
    rootLabels: string;
  };
}

/**
 * DSH-404 — build the per-handle `BurnProof`s for a DeMi `BurnNewHandles` tx, advancing the local
 * trie exactly as the contract's `all_burn_proofs_are_valid` does (the inverse of
 * `buildOrderProofs`):
 *
 *  1. Prove the handle's OWN key is present, then `mpt.delete` it (value `#""`) — existence-before,
 *     absence-after.
 *  2. For a FREE private virtual burn (`handle.freeVirtual` set), perform the second `mpt.update` on
 *     the ROOT key, AFTER the sub key delete: move the root value from `encode(free_names, labels)`
 *     to `encode(removeFreeName(free_names, subName), labels)` (reopening the slot), with the root
 *     proof taken on the post-sub-delete trie. `subName` is the sub portion of `sub@root` (hex),
 *     matching the contract's `parse_handle_name` + `registry_value.remove_free_name`.
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
    // 1. prove the key is present, then delete it
    const subProof = await db.prove(utf8Name);
    await db.delete(utf8Name);

    let free_virtual: BurnProof["free_virtual"];
    if (handle.freeVirtual) {
      const { isSubHandle, rootHandle, subHandle } = parseHandle(utf8Name);
      if (!isSubHandle) {
        throw new Error(`freeVirtual set on a non-sub handle "${utf8Name}"`);
      }
      const { rootFreeNames, rootLabels } = handle.freeVirtual;
      const subNameHex = Buffer.from(subHandle, "utf8").toString("hex");

      // 2. root proof on the POST-sub-delete trie, then remove the sub name (reopen the slot)
      const rootProof = await db.prove(rootHandle);
      const newRootValue = encodeRegistryValue(
        removeFreeName(rootFreeNames, subNameHex),
        rootLabels,
      );
      await db.delete(rootHandle);
      await db.insert(rootHandle, valueBuffer(newRootValue));

      free_virtual = {
        root_proof: parseMPTProofJSON(rootProof.toJSON()),
        root_free_names: rootFreeNames,
        root_labels: rootLabels,
      };
    }

    proofs.push({
      mpt_proof: parseMPTProofJSON(subProof.toJSON()),
      handle_name: hexName,
      is_virtual: isVirtual ? 1n : 0n,
      free_virtual,
    });
  }
  return proofs;
};
