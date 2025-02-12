import { decodeUplcProgramV2FromCbor, UplcProgramV2 } from "@helios-lang/uplc";

import { invariant } from "../helpers/index.js";
import blueprint from "./blueprint.js";
import { makeMintV1WithdrawUplcProgramParamter } from "./utils.js";

const getMintProxyMintUplcProgram = (): UplcProgramV2 => {
  const foundValidator = blueprint.validators.find(
    (validator) => validator.title == "mint_proxy.mint"
  );
  invariant(foundValidator, "Mint Proxy Mint Validator not found");
  return decodeUplcProgramV2FromCbor(foundValidator.compiledCode);
};

const getMintV1WithdrawUplcProgram = (
  orderScriptHash: string
): UplcProgramV2 => {
  const foundValidator = blueprint.validators.find(
    (validator) => validator.title == "mint_v1.withdraw"
  );
  invariant(foundValidator, "Mint V1 Withdraw Validator not found");
  return decodeUplcProgramV2FromCbor(foundValidator.compiledCode).apply(
    makeMintV1WithdrawUplcProgramParamter(orderScriptHash)
  );
};

const getOrderSpendUplcProgram = (): UplcProgramV2 => {
  const foundValidator = blueprint.validators.find(
    (validator) => validator.title == "order.spend"
  );
  invariant(foundValidator, "Order Spend Validator not found");
  return decodeUplcProgramV2FromCbor(foundValidator.compiledCode);
};

export {
  getMintProxyMintUplcProgram,
  getMintV1WithdrawUplcProgram,
  getOrderSpendUplcProgram,
};
