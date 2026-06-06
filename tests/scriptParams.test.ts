import { describe, expect, it } from "vitest";

import optimizedBlueprint from "../src/contracts/optimized-blueprint.js";
import {
  applyParamsToScript,
  type PlutusDataJson,
  plutusV2ScriptHash,
} from "../src/helpers/cardano-sdk/scriptParams.js";

// Fixture hashes pinned from the last helios-backed run (commit 5860270).
// They match byte-for-byte what UplcProgramV2.apply() produced, so if this
// test ever goes red it means scalus's apply diverged from the on-chain
// validator-hash expectations.
const HELIOS_PINNED_HASHES = {
  // demimntprx is unchanged by the subhandle/burn work, so this stays the helios-era pin.
  mintProxyIntV1: "c4d3329ac42cd35626f74d451a54b2d1ba1f9f380c9f88e3e7a9585b",
  // demimnt (governor) changed: DSH-201 enabled `can_burn_handles` (was a `False` stub), so its
  // compiled code — and this applied hash — moved. Re-pinned from the DSH-406 blueprint regen.
  mintV1WithdrawBytesA56: "009722011a8238e5ee6c217711fbfdd053e25ab549240d58a0dee0af",
  // demimntmpt takes 5 params (legacy_policy_id, admin_vkh + WS7 slot anchor: anchor_slot,
  // anchor_time_ms, slot_length_ms). This locks the current aiken-compiled validator's applied
  // hash as a regression. Re-pinned in DSH-406 after the Phase-1/2 ABI changes reached the
  // blueprint: free-virtual name-set (DSH-101/102 OrderProof/FreeVirtualData/registry_value) and
  // the DeMi burn path (DSH-202 BurnNewHandles/BurnProof) — each changes demimntmpt's code.
  mintingDataSpend5Params:
    "6cffc08919f671b87ee565f8380403adc63d20fe16cc6868d98dd6a5",
};

const findValidator = (title: string) => {
  const validator = optimizedBlueprint.validators.find(
    (v) => v.title === title,
  );
  if (!validator) throw new Error(`validator ${title} not in blueprint`);
  return validator.compiledCode;
};

describe("applyParamsToScript (scalus)", () => {
  it("matches the helios-era hash for the mint proxy with an int param", () => {
    const compiledCode = findValidator("demimntprx.mint");
    const hash = plutusV2ScriptHash(
      applyParamsToScript(compiledCode, [{ int: 1 } as PlutusDataJson]),
    );
    expect(hash).toBe(HELIOS_PINNED_HASHES.mintProxyIntV1);
  });

  it("matches the helios-era hash for mint v1 withdraw with a bytes param", () => {
    const compiledCode = findValidator("demimnt.withdraw");
    const hash = plutusV2ScriptHash(
      applyParamsToScript(compiledCode, [
        { bytes: "a".repeat(56) } as PlutusDataJson,
      ]),
    );
    expect(hash).toBe(HELIOS_PINNED_HASHES.mintV1WithdrawBytesA56);
  });

  it("matches the pinned hash for minting data spend with its 5 params (2 bytes + 3 ints)", () => {
    const compiledCode = findValidator("demimntmpt.spend");
    const hash = plutusV2ScriptHash(
      applyParamsToScript(compiledCode, [
        { bytes: "b".repeat(56) } as PlutusDataJson,
        { bytes: "c".repeat(56) } as PlutusDataJson,
        { int: 1 } as PlutusDataJson,
        { int: 2 } as PlutusDataJson,
        { int: 3 } as PlutusDataJson,
      ]),
    );
    expect(hash).toBe(HELIOS_PINNED_HASHES.mintingDataSpend5Params);
  });
});
