import {
  applyParamsToScript,
  type PlutusDataJson,
  plutusV2ScriptHash,
  plutusV3ScriptHash,
} from "../helpers/cardano-sdk/scriptParams.js";
import { invariant } from "../helpers/index.js";
import optimizedBlueprint from "./optimized-blueprint.js";
import unOptimizedBlueprint from "./unoptimized-blueprint.js";
import {
  makeMintingDataUplcProgramParameter,
  makeMintProxyUplcProgramParameter,
  makeMintV1UplcProgramParameter,
} from "./utils.js";

/** Plutus language version a validator was compiled with. */
export type BlueprintPlutusVersion = "v2" | "v3";

/**
 * A parameterized validator as consumed by the rest of the package.
 *
 * `optimizedCbor` / `unoptimizedCbor` are in double-CBOR form (byte string
 * wrapping byte string wrapping flat UPLC) — the format that
 * `Serialization.PlutusVxScript.fromCbor` and the on-chain `script_ref` field
 * both expect.
 *
 * `plutusVersion` is carried per-validator because the DeMi engine now mixes
 * versions: the three non-proxy validators (demimnt/demimntmpt/demiord) are
 * Plutus V3 (aiken v1.1.22), while the frozen mint proxy (demimntprx) stays
 * Plutus V2 (aiken v1.0.29-alpha). The hash differs by language tag, so the
 * correct version must be applied when wrapping/hashing each script.
 */
export interface AppliedPlutusScript {
  optimizedCbor: string;
  unoptimizedCbor: string;
  scriptHash: string;
  plutusVersion: BlueprintPlutusVersion;
}

/**
 * @deprecated Historical name from when every DeMi validator was Plutus V2.
 * Kept as an alias so existing references compile; new code should use
 * `AppliedPlutusScript` and consult `plutusVersion`.
 */
export type AppliedPlutusV2Script = AppliedPlutusScript;

const findValidator = (title: string) => {
  const optimized = optimizedBlueprint.validators.find((v) => v.title === title);
  const unoptimized = unOptimizedBlueprint.validators.find((v) => v.title === title);
  invariant(
    !!optimized && !!unoptimized,
    `Validator not found in blueprint: ${title}`,
  );
  return { optimized, unoptimized };
};

const normalizeVersion = (
  title: string,
  raw: unknown,
): BlueprintPlutusVersion => {
  invariant(
    raw === "v2" || raw === "v3",
    `Blueprint validator ${title} has invalid plutusVersion: ${String(raw)}`,
  );
  return raw;
};

const applyAndHash = (
  title: string,
  params: PlutusDataJson[],
): AppliedPlutusScript => {
  const { optimized, unoptimized } = findValidator(title);
  // Per-validator version (merged blueprint mixes V2 proxy + V3 validators).
  const plutusVersion = normalizeVersion(
    title,
    (optimized as { plutusVersion?: string }).plutusVersion,
  );
  const optimizedCbor = applyParamsToScript(optimized.compiledCode, params);
  const unoptimizedCbor = applyParamsToScript(unoptimized.compiledCode, params);
  const scriptHash =
    plutusVersion === "v3"
      ? plutusV3ScriptHash(optimizedCbor)
      : plutusV2ScriptHash(optimizedCbor);
  return { optimizedCbor, unoptimizedCbor, scriptHash, plutusVersion };
};

export const getMintProxyMintValidator = (
  mint_version: bigint,
): AppliedPlutusScript =>
  applyAndHash("demimntprx.mint", makeMintProxyUplcProgramParameter(mint_version));

export const getMintV1WithdrawValidator = (
  minting_data_script_hash: string,
): AppliedPlutusScript =>
  applyAndHash(
    "demimnt.withdraw",
    makeMintV1UplcProgramParameter(minting_data_script_hash),
  );

export const getMintingDataSpendValidator = (
  legacy_policy_id: string,
  admin_verification_key_hash: string,
  // WS7 slot->POSIX anchor (network-specific, from getSlotAnchor)
  anchor_slot: number,
  anchor_time_ms: number,
  slot_length_ms: number,
): AppliedPlutusScript =>
  applyAndHash(
    "demimntmpt.spend",
    makeMintingDataUplcProgramParameter(
      legacy_policy_id,
      admin_verification_key_hash,
      anchor_slot,
      anchor_time_ms,
      slot_length_ms,
    ),
  );

export const getOrdersSpendValidator = (): AppliedPlutusScript =>
  applyAndHash("demiord.spend", []);
