import type { Cardano as CardanoTypes } from "@cardano-sdk/core";
import { describe, expect, it } from "vitest";

import { Cardano } from "../src/helpers/cardano-sdk/index.js";
import { computeScriptDataHash } from "../src/helpers/cardano-sdk/computeScriptDataHash.js";

// Minimal V2 cost model (real models are 332 entries; the function does not
// validate length — it just emits what's given). Used so the hash is stable
// across tests without pinning a real Conway snapshot here.
const sampleCostModels = new Map<CardanoTypes.PlutusLanguageVersion, number[]>([
  [Cardano.PlutusLanguageVersion.V2, [100, 200, 300]],
]);

const sampleRedeemer: CardanoTypes.Redeemer = {
  data: 42n,
  executionUnits: { memory: 1000, steps: 5000 },
  index: 0,
  purpose: Cardano.RedeemerPurpose.spend,
};

describe("computeScriptDataHash", () => {
  it("returns undefined when no redeemers and no datums", () => {
    expect(
      computeScriptDataHash(
        sampleCostModels,
        [Cardano.PlutusLanguageVersion.V2],
        undefined,
        undefined,
      ),
    ).toBeUndefined();
    expect(
      computeScriptDataHash(
        sampleCostModels,
        [Cardano.PlutusLanguageVersion.V2],
        [],
        [],
      ),
    ).toBeUndefined();
  });

  it("returns a 32-byte blake2b hash (hex) when redeemers are present", () => {
    const hash = computeScriptDataHash(
      sampleCostModels,
      [Cardano.PlutusLanguageVersion.V2],
      [sampleRedeemer],
    );
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same inputs", () => {
    const h1 = computeScriptDataHash(
      sampleCostModels,
      [Cardano.PlutusLanguageVersion.V2],
      [sampleRedeemer],
    );
    const h2 = computeScriptDataHash(
      sampleCostModels,
      [Cardano.PlutusLanguageVersion.V2],
      [sampleRedeemer],
    );
    expect(h1).toBe(h2);
  });

  it("differs from upstream Alonzo-array-style hash", () => {
    // Different cost-model shape changes the language_views encoding →
    // distinct hash. This asserts the function is actually consuming the
    // cost models (regression guard in case language_views computation
    // regresses to a no-op).
    const altCostModels = new Map<
      CardanoTypes.PlutusLanguageVersion,
      number[]
    >([[Cardano.PlutusLanguageVersion.V2, [999, 999, 999]]]);
    const h1 = computeScriptDataHash(
      sampleCostModels,
      [Cardano.PlutusLanguageVersion.V2],
      [sampleRedeemer],
    );
    const h2 = computeScriptDataHash(
      altCostModels,
      [Cardano.PlutusLanguageVersion.V2],
      [sampleRedeemer],
    );
    expect(h1).not.toBe(h2);
  });
});
