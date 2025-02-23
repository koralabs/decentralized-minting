import { decodeUplcProgramV2FromCbor, UplcProgramV2 } from "@helios-lang/uplc";

import { invariant } from "../helpers/index.js";
import blueprint from "./blueprint.js";
import {
  makeMintingDataProxyUplcProgramParameter,
  makeMintProxyUplcProgramParameter,
} from "./utils.js";

const getMintProxyMintUplcProgram = (mint_version: bigint): UplcProgramV2 => {
  const foundValidator = blueprint.validators.find(
    (validator) => validator.title == "mint_proxy.mint"
  );
  invariant(foundValidator, "Mint Proxy Mint Validator not found");
  return decodeUplcProgramV2FromCbor(foundValidator.compiledCode).apply(
    makeMintProxyUplcProgramParameter(mint_version)
  );
};

const getMintV1WithdrawUplcProgram = (): UplcProgramV2 => {
  const foundValidator = blueprint.validators.find(
    (validator) => validator.title == "mint_v1.withdraw"
  );
  invariant(foundValidator, "Mint V1 Withdraw Validator not found");
  return decodeUplcProgramV2FromCbor(foundValidator.compiledCode);
};

const getMintingDataProxySpendUplcProgram = (
  minting_data_governor: string
): UplcProgramV2 => {
  const foundValidator = blueprint.validators.find(
    (validator) => validator.title == "minting_data_proxy.spend"
  );
  invariant(foundValidator, "Minting Data Proxy Spend Validator not found");
  return decodeUplcProgramV2FromCbor(foundValidator.compiledCode).apply(
    makeMintingDataProxyUplcProgramParameter(minting_data_governor)
  );
};

// this is `minting_data_governor`
const getMintingDataV1WithdrawUplcProgram = (): UplcProgramV2 => {
  const foundValidator = blueprint.validators.find(
    (validator) => validator.title == "minting_data_v1.withdraw"
  );
  invariant(foundValidator, "Minting Data V1 Withdraw Validator not found");
  return decodeUplcProgramV2FromCbor(foundValidator.compiledCode);
};

const getOrdersSpendUplcProgram = (): UplcProgramV2 => {
  const foundValidator = blueprint.validators.find(
    (validator) => validator.title == "orders.spend"
  );
  invariant(foundValidator, "Orders Spend Validator not found");
  return decodeUplcProgramV2FromCbor(foundValidator.compiledCode);
};

export {
  getMintingDataProxySpendUplcProgram,
  getMintingDataV1WithdrawUplcProgram,
  getMintProxyMintUplcProgram,
  getMintV1WithdrawUplcProgram,
  getOrdersSpendUplcProgram,
};
