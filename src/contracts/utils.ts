import {
  makeByteArrayData,
  makeIntData,
  makeUplcDataValue,
  UplcValue,
} from "@helios-lang/uplc";

const makeMintProxyUplcProgramParameter = (
  mint_version: bigint
): UplcValue[] => {
  return [makeUplcDataValue(makeIntData(mint_version))];
};

const makeMintingDataProxyUplcProgramParameter = (
  minting_data_governor: string
): UplcValue[] => {
  return [makeUplcDataValue(makeByteArrayData(minting_data_governor))];
};

export {
  makeMintingDataProxyUplcProgramParameter,
  makeMintProxyUplcProgramParameter,
};
