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

const makeMintingDataV1UplcProgramParameter = (
  god_verification_key_hash: string
): UplcValue[] => {
  return [makeUplcDataValue(makeByteArrayData(god_verification_key_hash))];
};

export {
  makeMintingDataProxyUplcProgramParameter,
  makeMintingDataV1UplcProgramParameter,
  makeMintProxyUplcProgramParameter,
};
