import { decodeUplcProgramV2FromCbor, UplcProgramV2 } from "@helios-lang/uplc";

import { invariant } from "../helpers/index.js";
import optimizedBlueprint from "./optimized-blueprint.js";
import unOptimizedBlueprint from "./unoptimized-blueprint.js";
import {
  makeMintingDataUplcProgramParameter,
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

// this is `minting_data_script_hash`
const getMintingDataSpendUplcProgram = (
  legacy_policy_id: string,
  god_verification_key_hash: string
): UplcProgramV2 => {
  const optimizedFoundValidator = optimizedBlueprint.validators.find(
    (validator) => validator.title == "minting_data.spend"
  );
  const unOptimizedFoundValidator = unOptimizedBlueprint.validators.find(
    (validator) => validator.title == "minting_data.spend"
  );
  invariant(
    !!optimizedFoundValidator && !!unOptimizedFoundValidator,
    "Minting Data Spend Validator not found"
  );
  return decodeUplcProgramV2FromCbor(optimizedFoundValidator.compiledCode)
    .apply(
      makeMintingDataUplcProgramParameter(
        legacy_policy_id,
        god_verification_key_hash
      )
    )
    .withAlt(
      decodeUplcProgramV2FromCbor(unOptimizedFoundValidator.compiledCode).apply(
        makeMintingDataUplcProgramParameter(
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
  getMintingDataSpendUplcProgram,
  getMintProxyMintUplcProgram,
  getMintV1WithdrawUplcProgram,
  getOrdersSpendUplcProgram,
};
