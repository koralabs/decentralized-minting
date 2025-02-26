import { decodeUplcProgramV2FromCbor, UplcProgramV2 } from "@helios-lang/uplc";

import { invariant } from "../helpers/index.js";
import optimizedBlueprint from "./optimized-blueprint.js";
import unOptimizedBlueprint from "./unoptimized-blueprint.js";
import {
  makeMintingDataProxyUplcProgramParameter,
  makeMintingDataV1UplcProgramParameter,
  makeMintProxyUplcProgramParameter,
} from "./utils.js";

const getMintProxyMintUplcProgram = (mint_version: bigint): UplcProgramV2 => {
  const optimizedFoundValidator = optimizedBlueprint.validators.find(
    (validator) => validator.title == "mint_proxy.mint"
  );
  const unOptimizedFoundValidator = unOptimizedBlueprint.validators.find(
    (validator) => validator.title == "mint_proxy.mint"
  );
  invariant(
    !!optimizedFoundValidator && !!unOptimizedFoundValidator,
    "Mint Proxy Mint Validator not found"
  );
  return decodeUplcProgramV2FromCbor(optimizedFoundValidator.compiledCode)
    .apply(makeMintProxyUplcProgramParameter(mint_version))
    .withAlt(
      decodeUplcProgramV2FromCbor(unOptimizedFoundValidator.compiledCode).apply(
        makeMintProxyUplcProgramParameter(mint_version)
      )
    );
};

const getMintV1WithdrawUplcProgram = (): UplcProgramV2 => {
  const optimizedFoundValidator = optimizedBlueprint.validators.find(
    (validator) => validator.title == "mint_v1.withdraw"
  );
  const unOptimizedFoundValidator = unOptimizedBlueprint.validators.find(
    (validator) => validator.title == "mint_v1.withdraw"
  );
  invariant(
    !!optimizedFoundValidator && unOptimizedFoundValidator,
    "Mint V1 Withdraw Validator not found"
  );
  return decodeUplcProgramV2FromCbor(
    optimizedFoundValidator.compiledCode
  ).withAlt(
    decodeUplcProgramV2FromCbor(unOptimizedFoundValidator.compiledCode)
  );
};

const getMintingDataProxySpendUplcProgram = (
  minting_data_governor: string
): UplcProgramV2 => {
  const optimizedFoundValidator = optimizedBlueprint.validators.find(
    (validator) => validator.title == "minting_data_proxy.spend"
  );
  const unOptimizedFoundValidator = unOptimizedBlueprint.validators.find(
    (validator) => validator.title == "minting_data_proxy.spend"
  );
  invariant(
    !!optimizedFoundValidator && !!unOptimizedFoundValidator,
    "Minting Data Proxy Spend Validator not found"
  );
  return decodeUplcProgramV2FromCbor(optimizedFoundValidator.compiledCode)
    .apply(makeMintingDataProxyUplcProgramParameter(minting_data_governor))
    .withAlt(
      decodeUplcProgramV2FromCbor(unOptimizedFoundValidator.compiledCode).apply(
        makeMintingDataProxyUplcProgramParameter(minting_data_governor)
      )
    );
};

// this is `minting_data_governor`
const getMintingDataV1WithdrawUplcProgram = (
  legacy_policy_id: string,
  god_verification_key_hash: string
): UplcProgramV2 => {
  const optimizedFoundValidator = optimizedBlueprint.validators.find(
    (validator) => validator.title == "minting_data_v1.withdraw"
  );
  const unOptimizedFoundValidator = unOptimizedBlueprint.validators.find(
    (validator) => validator.title == "minting_data_v1.withdraw"
  );
  invariant(
    !!optimizedFoundValidator && !!unOptimizedFoundValidator,
    "Minting Data V1 Withdraw Validator not found"
  );
  return decodeUplcProgramV2FromCbor(optimizedFoundValidator.compiledCode)
    .apply(
      makeMintingDataV1UplcProgramParameter(
        legacy_policy_id,
        god_verification_key_hash
      )
    )
    .withAlt(
      decodeUplcProgramV2FromCbor(unOptimizedFoundValidator.compiledCode).apply(
        makeMintingDataV1UplcProgramParameter(
          legacy_policy_id,
          god_verification_key_hash
        )
      )
    );
};

const getOrdersSpendUplcProgram = (): UplcProgramV2 => {
  const optimizedFoundValidator = optimizedBlueprint.validators.find(
    (validator) => validator.title == "orders.spend"
  );
  const unOptimizedFoundValidator = unOptimizedBlueprint.validators.find(
    (validator) => validator.title == "orders.spend"
  );
  invariant(
    !!optimizedFoundValidator && !!unOptimizedFoundValidator,
    "Orders Spend Validator not found"
  );
  return decodeUplcProgramV2FromCbor(
    optimizedFoundValidator.compiledCode
  ).withAlt(
    decodeUplcProgramV2FromCbor(unOptimizedFoundValidator.compiledCode)
  );
};

export {
  getMintingDataProxySpendUplcProgram,
  getMintingDataV1WithdrawUplcProgram,
  getMintProxyMintUplcProgram,
  getMintV1WithdrawUplcProgram,
  getOrdersSpendUplcProgram,
};
