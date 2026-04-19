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
  mintingDataSpend2Bytes:
    "b5d849c08470aa05329369e9e277b97a2176db84d0087cbfc03ceb7f",
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

  it("matches the helios-era hash for minting data spend with two bytes params", () => {
    const compiledCode = findValidator("demimntmpt.spend");
    const hash = plutusV2ScriptHash(
      applyParamsToScript(compiledCode, [
        { bytes: "b".repeat(56) } as PlutusDataJson,
        { bytes: "c".repeat(56) } as PlutusDataJson,
      ]),
    );
    expect(hash).toBe(HELIOS_PINNED_HASHES.mintingDataSpend2Bytes);
  });
});
