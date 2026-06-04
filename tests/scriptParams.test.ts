import { describe, expect, it } from "vitest";

import optimizedBlueprint from "../src/contracts/optimized-blueprint.js";
import {
  applyParamsToScript,
  plutusV2ScriptHash,
  type PlutusDataJson,
} from "../src/helpers/cardano-sdk/scriptParams.js";

// Fixture hashes pinned from the last helios-backed run (commit 5860270).
// They match byte-for-byte what UplcProgramV2.apply() produced, so if this
// test ever goes red it means scalus's apply diverged from the on-chain
// validator-hash expectations.
const HELIOS_PINNED_HASHES = {
  mintProxyIntV1: "c4d3329ac42cd35626f74d451a54b2d1ba1f9f380c9f88e3e7a9585b",
  mintV1WithdrawBytesA56: "7a39effb031fb6dd2f680e7160debcd6fae93592ac9aab0d7c7d03d8",
  // demimntmpt now takes 5 params (legacy_policy_id, admin_vkh + WS7 slot anchor:
  // anchor_slot, anchor_time_ms, slot_length_ms). The old 2-param helios pin no longer
  // applies; this locks the current aiken-compiled validator's applied hash as a regression.
  // Updated when OrderDatum gained `is_virtual` (subhandle type): demimntmpt decodes
  // OrderDatum in all_orders_are_satisfied, so its compiled code + applied hash changed.
  mintingDataSpend5Params:
    "5325f18629b1e84b7b35e851ce898a6d27dddf9867c0e45dfde7570e",
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
