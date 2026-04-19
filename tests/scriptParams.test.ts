import { Buffer } from "node:buffer";

import { decodeUplcProgramV2FromCbor } from "@helios-lang/uplc";
import { describe, expect, it } from "vitest";

import optimizedBlueprint from "../src/contracts/optimized-blueprint.js";
import {
  makeMintingDataUplcProgramParameter,
  makeMintProxyUplcProgramParameter,
  makeMintV1UplcProgramParameter,
} from "../src/contracts/utils.js";
import {
  applyParamsToScript,
  plutusV2ScriptHash,
  type PlutusDataJson,
} from "../src/helpers/cardano-sdk/scriptParams.js";

const findValidator = (title: string) => {
  const validator = optimizedBlueprint.validators.find(
    (v) => v.title === title,
  );
  if (!validator) throw new Error(`validator ${title} not in blueprint`);
  return validator.compiledCode;
};

// Cross-validation: for the same parameters, scalus-based apply must
// produce the same script hash as helios's UplcProgramV2.apply().
const heliosApplyAndHash = (
  compiledCode: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  heliosParams: any[],
): string => {
  const program = decodeUplcProgramV2FromCbor(compiledCode).apply(heliosParams);
  // helios returns Uint8Array for the hash; normalize to hex.
  const hashValue = program.hash();
  if (typeof hashValue === "string") return hashValue;
  return Buffer.from(hashValue as Uint8Array).toString("hex");
};

describe("applyParamsToScript (scalus)", () => {
  it("matches helios hash for the mint proxy with an int param", () => {
    const compiledCode = findValidator("demimntprx.mint");
    const mintVersion = 1n;

    const scalusHash = plutusV2ScriptHash(
      applyParamsToScript(compiledCode, [
        { int: Number(mintVersion) } as PlutusDataJson,
      ]),
    );
    const heliosHash = heliosApplyAndHash(
      compiledCode,
      makeMintProxyUplcProgramParameter(mintVersion),
    );

    expect(scalusHash).toBe(heliosHash);
  });

  it("matches helios hash for mint v1 withdraw with a bytes param", () => {
    const compiledCode = findValidator("demimnt.withdraw");
    const hash = "a".repeat(56);

    const scalusHash = plutusV2ScriptHash(
      applyParamsToScript(compiledCode, [{ bytes: hash } as PlutusDataJson]),
    );
    const heliosHash = heliosApplyAndHash(
      compiledCode,
      makeMintV1UplcProgramParameter(hash),
    );

    expect(scalusHash).toBe(heliosHash);
  });

  it("matches helios hash for minting data spend with two bytes params", () => {
    const compiledCode = findValidator("demimntmpt.spend");
    const legacyPolicyId = "b".repeat(56);
    const adminKeyHash = "c".repeat(56);

    const scalusHash = plutusV2ScriptHash(
      applyParamsToScript(compiledCode, [
        { bytes: legacyPolicyId } as PlutusDataJson,
        { bytes: adminKeyHash } as PlutusDataJson,
      ]),
    );
    const heliosHash = heliosApplyAndHash(
      compiledCode,
      makeMintingDataUplcProgramParameter(legacyPolicyId, adminKeyHash),
    );

    expect(scalusHash).toBe(heliosHash);
  });
});
