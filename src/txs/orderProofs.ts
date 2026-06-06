import { Trie } from "@aiken-lang/merkle-patricia-forestry";

import { type NewHandle, type OrderProof, parseMPTProofJSON } from "../contracts/index.js";
import { valueBuffer } from "../store/labelSet.js";
import { addFreeName, encode as encodeRegistryValue } from "../store/registryValue.js";
import { parseHandle } from "../utils/index.js";

/**
 * DSH-403 — build the per-order `OrderProof`s for a DeMi `MintNewHandles` tx, advancing the local
 * trie exactly as the contract's `all_orders_are_satisfied` does so the on-chain `mpt` ops verify:
 *
 *  1. Insert the handle's OWN key with an empty value (`mpt.insert(root, handle, #"", proof)`), in
 *     order-input order. This is identical for root / nft sub / virtual sub — every mint inserts.
 *  2. For a FREE private virtual (`handle.freeVirtual` set), perform the SECOND `mpt.update` on the
 *     ROOT key, AFTER the sub key insert: move the root value from `encode(free_names, labels)` to
 *     `encode(addFreeName(free_names, subName), labels)`, capturing the root proof taken on the
 *     post-sub-insert trie. The contract re-derives the same old/new bytes, so any divergence here
 *     fails the tx. `subName` is the sub portion of `sub@root` (hex of its utf8 bytes), matching
 *     the contract's `parse_handle_name` + `registry_value.add_free_name`.
 *
 * Mutates `db`; callers read `db.hash` afterwards for the new minting-data root. Paid orders (root,
 * nft sub, public virtual, private virtual past the allowance) carry `free_virtual = undefined`.
 */
export const buildOrderProofs = async (
  db: Trie,
  handles: NewHandle[],
): Promise<OrderProof[]> => {
  const proofs: OrderProof[] = [];
  for (const handle of handles) {
    const { utf8Name } = handle;
    // 1. insert the handle's own key (empty value) and prove it
    await db.insert(utf8Name, "");
    const subProof = await db.prove(utf8Name);

    let free_virtual: OrderProof["free_virtual"];
    if (handle.freeVirtual) {
      const { isSubHandle, rootHandle, subHandle } = parseHandle(utf8Name);
      if (!isSubHandle) {
        throw new Error(`freeVirtual set on a non-sub handle "${utf8Name}"`);
      }
      const { rootFreeNames, rootLabels } = handle.freeVirtual;
      const subNameHex = Buffer.from(subHandle, "utf8").toString("hex");

      // 2. root proof on the POST-sub-insert trie (root still holds its current value), then bump
      const rootProof = await db.prove(rootHandle);
      const newRootValue = encodeRegistryValue(
        addFreeName(rootFreeNames, subNameHex),
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
      free_virtual,
    });
  }
  return proofs;
};
