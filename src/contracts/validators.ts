import { TxOutputId } from "@helios-lang/ledger";
import { decodeUplcProgramV2FromCbor, UplcProgramV2 } from "@helios-lang/uplc";

import { invariant } from "../helpers/index.js";
import blueprint from "./plutus.json" assert { type: "json" };
import {
  makeMintProxyMintUplcProgramParameter,
  makeMintV1WithdrawUplcProgramParamter,
  makeOrderSpendUplcProgramParameter,
  makeSettingsProxyMintUplcProgramParamter,
  makeSettingsProxySpendUplcProgramParamter,
} from "./utils.js";

const getMintProxyMintUplcProgram = (
  settingsPolicyId: string
): UplcProgramV2 => {
  const foundValidator = blueprint.validators.find(
    (validator) => validator.title == "mint_proxy.mint"
  );
  invariant(foundValidator, "Mint Proxy Mint Validator not found");
  return decodeUplcProgramV2FromCbor(foundValidator.compiledCode).apply(
    makeMintProxyMintUplcProgramParameter(settingsPolicyId)
  );
};

const getMintV1WithdrawUplcProgram = (
  settingsPolicyId: string,
  orderScriptHash: string
): UplcProgramV2 => {
  const foundValidator = blueprint.validators.find(
    (validator) => validator.title == "mint_v1.withdraw"
  );
  invariant(foundValidator, "Mint V1 Withdraw Validator not found");
  return decodeUplcProgramV2FromCbor(foundValidator.compiledCode).apply(
    makeMintV1WithdrawUplcProgramParamter(settingsPolicyId, orderScriptHash)
  );
};

const getOrderSpendUplcProgram = (settingsPolicyId: string): UplcProgramV2 => {
  const foundValidator = blueprint.validators.find(
    (validator) => validator.title == "order.spend"
  );
  invariant(foundValidator, "Order Spend Validator not found");
  return decodeUplcProgramV2FromCbor(foundValidator.compiledCode).apply(
    makeOrderSpendUplcProgramParameter(settingsPolicyId)
  );
};

const getSettingsProxySpendUplcProgram = (
  initialTxOutputId: TxOutputId
): UplcProgramV2 => {
  const foundValidator = blueprint.validators.find(
    (validator) => validator.title == "settings_proxy.spend"
  );
  invariant(foundValidator, "Settings Proxy Spend Validator not found");
  return decodeUplcProgramV2FromCbor(foundValidator.compiledCode).apply(
    makeSettingsProxySpendUplcProgramParamter(initialTxOutputId)
  );
};

const getSettingsProxyMintUplcProgram = (
  initialTxOutputId: TxOutputId
): UplcProgramV2 => {
  const foundValidator = blueprint.validators.find(
    (validator) => validator.title == "settings_proxy.mint"
  );
  invariant(foundValidator, "Settings Proxy Mint Validator not found");
  return decodeUplcProgramV2FromCbor(foundValidator.compiledCode).apply(
    makeSettingsProxyMintUplcProgramParamter(initialTxOutputId)
  );
};

const getSettingsV1StakeUplcProgram = (): UplcProgramV2 => {
  const foundValidator = blueprint.validators.find(
    (validator) => validator.title == "settings_v1.stake"
  );
  invariant(foundValidator, "Settings V1 Stake Validator not found");
  return decodeUplcProgramV2FromCbor(foundValidator.compiledCode);
};

const getSettingsV1DocumentationUplcProgram = (): UplcProgramV2 => {
  const foundValidator = blueprint.validators.find(
    (validator) => validator.title == "settings_v1.documentation"
  );
  invariant(foundValidator, "Settings V1 Documentation Validator not found");
  return decodeUplcProgramV2FromCbor(foundValidator.compiledCode);
};

export {
  getMintProxyMintUplcProgram,
  getMintV1WithdrawUplcProgram,
  getOrderSpendUplcProgram,
  getSettingsProxyMintUplcProgram,
  getSettingsProxySpendUplcProgram,
  getSettingsV1DocumentationUplcProgram,
  getSettingsV1StakeUplcProgram,
};
