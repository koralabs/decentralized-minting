import {
  makeByteArrayData,
  makeUplcDataValue,
  UplcValue,
} from "@helios-lang/uplc";

const makeMintV1WithdrawUplcProgramParamter = (
  orderScriptHash: string
): UplcValue[] => {
  return [makeUplcDataValue(makeByteArrayData(orderScriptHash))];
};

export { makeMintV1WithdrawUplcProgramParamter };
