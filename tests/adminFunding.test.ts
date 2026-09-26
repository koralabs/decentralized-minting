// The MPT-root migration pays its fee and collateral from the admin wallet's ADA-only UTxOs. When the
// wallet is short, the prep tx must hand it one clean, valid UTxO. Preview 2026-09-26: the old check
// counted ADA locked under tokens as spendable and paid only the 0.32 ADA gap, below min-UTxO.
// Only the network (Blockfrost + Handles API) is faked.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";

import { buildPreparationTx } from "../src/deploymentTx.js";
import { Serialization } from "../src/helpers/cardano-sdk/index.js";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/blockfrost-preview/${name}.json`, import.meta.url), "utf8");
const ADMIN_HASH = "4da965a049dfd15ed1ee19fba6e2974a0b79fc416dd1796a1f97f5e1";
const MULTISIG = "addr_test1xp5gahy5jpx99p4vtnq2mfsmnjz84rfrqxyznqewp62mzy2tqcwlsq95pxz027092fzsjgpfzzaunne0qa9glmj38dfqafd0cf";
const HANDLE_POLICY = "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";
const utxo = (hash: string, lovelace: number, tokens: string[] = []) => ({
  tx_hash: hash.repeat(64 / hash.length), tx_index: 0, output_index: 0, block: "", data_hash: null, inline_datum: null, reference_script_hash: null,
  amount: [{ unit: "lovelace", quantity: String(lovelace) }, ...tokens.map((unit) => ({ unit, quantity: "1" }))],
});
const desired = { network: "preview", buildParameters: { adminVerificationKeyHash: ADMIN_HASH } } as never;

const stubNetwork = (adminUtxos: unknown[]) =>
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/handles/")) return new Response(JSON.stringify({ utxo: `${"dd".repeat(32)}#0`, resolved_addresses: { ada: MULTISIG } }));
    if (u.includes(`/addresses/${MULTISIG}/utxos`)) {
      return new Response(JSON.stringify(u.includes("page=1") ? [utxo("dd", 3_000_000, [`${HANDLE_POLICY}000de140646d6f`]), utxo("ee", 90_000_000)] : []));
    }
    if (u.includes("/addresses/") && u.includes("/utxos")) return new Response(JSON.stringify(u.includes("page=1") ? adminUtxos : []));
    if (u.includes("/txs/")) return new Response(JSON.stringify({ outputs: [{ output_index: 0, amount: [{ unit: "lovelace", quantity: "3000000" }, { unit: `${HANDLE_POLICY}000de140646d6f`, quantity: "1" }], inline_datum: null }] }));
    if (u.endsWith("/blocks/latest")) return new Response(fixture("blocks_latest"));
    if (u.endsWith("/genesis")) return new Response(fixture("genesis"));
    if (u.endsWith("/epochs/latest/parameters")) return new Response(fixture("epochs_latest_parameters"));
    return new Response("unmocked", { status: 500 });
  }));

const adminOutputCoins = (cborHex: string) =>
  Serialization.Transaction.fromCbor(cborHex as never).toCore().body.outputs
    .filter((o) => String(o.address) !== MULTISIG)
    .map((o) => o.value.coins);

describe("admin funding prep tx", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("ADA held under tokens is not spendable: the wallet gets the full target as one clean UTxO", async () => {
    stubNetwork([utxo("aa", 9_680_351, [`${HANDLE_POLICY}000de1406e6f7065`])]);
    const tx = await buildPreparationTx({ desired, blockfrostApiKey: "k", userAgent: "t" });
    // The old code saw 9.68 ADA, "needed" 0.32 ADA and emitted a 319,649-lovelace output (invalid).
    expect(tx && adminOutputCoins(tx.cborHex)).toEqual([10_000_000n]);
  });

  test("enough ADA-only balance needs no prep tx", async () => {
    stubNetwork([utxo("aa", 12_000_000), utxo("bb", 2_000_000, [`${HANDLE_POLICY}000de1406e6f7065`])]);
    expect(await buildPreparationTx({ desired, blockfrostApiKey: "k", userAgent: "t" })).toBeNull();
  });
});
