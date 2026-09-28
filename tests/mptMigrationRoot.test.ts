// A demimntmpt migration moves handle_root@handle_settings to the new script address and must carry
// the MPT root forward unchanged. The root is recomputed from the Handles API; if the API lags the
// chain by one mint, the migration would write a stale root. (Mainnet datum shape: Constr 0 [bytes32].)
import { describe, expect, test } from "vitest";

import { assertMigrationPreservesRoot } from "../src/deploymentTx.js";

const ROOT = "5224d1767666858ef0933185faa6f0dbc4b704585085168ea3652e20e4ee9cbd";
const DATUM = `d8799f5820${ROOT}ff`;

describe("MPT root migration", () => {
  test("accepts a recomputed root equal to the on-chain root", () => {
    expect(() => assertMigrationPreservesRoot(DATUM, ROOT)).not.toThrow();
  });

  test("refuses a recomputed root that differs from the on-chain root (API behind the chain)", () => {
    expect(() => assertMigrationPreservesRoot(DATUM, "00".repeat(32))).toThrow(/refusing MPT root migration/);
  });

  test("refuses when the root UTxO carries no datum", () => {
    expect(() => assertMigrationPreservesRoot(undefined, ROOT)).toThrow(/on-chain root \(none\)/);
  });
});
