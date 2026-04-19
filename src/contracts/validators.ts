import {
  applyParamsToScript,
  type PlutusDataJson,
  plutusV2ScriptHash,
} from "../helpers/cardano-sdk/scriptParams.js";
import { invariant } from "../helpers/index.js";
import optimizedBlueprint from "./optimized-blueprint.js";
import unOptimizedBlueprint from "./unoptimized-blueprint.js";
import {
  makeMintingDataUplcProgramParameter,
  makeMintProxyUplcProgramParameter,
  makeMintV1UplcProgramParameter,
} from "./utils.js";

/**
 * A parameterized validator as consumed by the rest of the package.
 *
 * `optimizedCbor` / `unoptimizedCbor` are in double-CBOR form (byte string
 * wrapping byte string wrapping flat UPLC) — the format that
 * `Serialization.PlutusV2Script.fromCbor` and the on-chain `script_ref` field
 * both expect.
 */
export interface AppliedPlutusV2Script {
  optimizedCbor: string;
  unoptimizedCbor: string;
  scriptHash: string;
}

const findValidator = (title: string) => {
  const optimized = optimizedBlueprint.validators.find((v) => v.title === title);
  const unoptimized = unOptimizedBlueprint.validators.find((v) => v.title === title);
  invariant(
    !!optimized && !!unoptimized,
    `Validator not found in blueprint: ${title}`,
  );
  return { optimized, unoptimized };
};

const applyAndHash = (
  title: string,
  params: PlutusDataJson[],
): AppliedPlutusV2Script => {
  const { optimized, unoptimized } = findValidator(title);
  const optimizedCbor = applyParamsToScript(optimized.compiledCode, params);
  const unoptimizedCbor = applyParamsToScript(unoptimized.compiledCode, params);
  const scriptHash = plutusV2ScriptHash(optimizedCbor);
  return { optimizedCbor, unoptimizedCbor, scriptHash };
};

export const getMintProxyMintValidator = (
  mint_version: bigint,
): AppliedPlutusV2Script =>
  applyAndHash("demimntprx.mint", makeMintProxyUplcProgramParameter(mint_version));

export const getMintV1WithdrawValidator = (
  minting_data_script_hash: string,
): AppliedPlutusV2Script =>
  applyAndHash(
    "demimnt.withdraw",
    makeMintV1UplcProgramParameter(minting_data_script_hash),
  );

export const getMintingDataSpendValidator = (
  legacy_policy_id: string,
  admin_verification_key_hash: string,
): AppliedPlutusV2Script =>
  applyAndHash(
    "demimntmpt.spend",
    makeMintingDataUplcProgramParameter(
      legacy_policy_id,
      admin_verification_key_hash,
    ),
  );

export const getOrdersSpendValidator = (): AppliedPlutusV2Script =>
  applyAndHash("demiord.spend", []);
