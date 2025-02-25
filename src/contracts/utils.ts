import {
  InlineTxOutputDatum,
  makeInlineTxOutputDatum,
} from "@helios-lang/ledger";
import {
  makeByteArrayData,
  makeIntData,
  makeListData,
  makeUplcDataValue,
  UplcValue,
} from "@helios-lang/uplc";

const makeMintProxyUplcProgramParameter = (
  mint_version: bigint
): UplcValue[] => {
  return [makeUplcDataValue(makeIntData(mint_version))];
};

const makeMintProxyUplcProgramParameterDatum = (
  mint_version: bigint
): InlineTxOutputDatum => {
  return makeInlineTxOutputDatum(makeListData([makeIntData(mint_version)]));
};

const makeMintingDataProxyUplcProgramParameter = (
  minting_data_governor: string
): UplcValue[] => {
  return [makeUplcDataValue(makeByteArrayData(minting_data_governor))];
};

const makeMintingDataProxyUplcProgramParameterDatum = (
  minting_data_governor: string
): InlineTxOutputDatum => {
  return makeInlineTxOutputDatum(
    makeListData([makeByteArrayData(minting_data_governor)])
  );
};

const makeMintingDataV1UplcProgramParameter = (
  god_verification_key_hash: string
): UplcValue[] => {
  return [makeUplcDataValue(makeByteArrayData(god_verification_key_hash))];
};

const makeMintingDataV1UplcProgramParameterDatum = (
  god_verification_key_hash: string
): InlineTxOutputDatum => {
  return makeInlineTxOutputDatum(
    makeListData([makeByteArrayData(god_verification_key_hash)])
  );
};

export {
  makeMintingDataProxyUplcProgramParameter,
  makeMintingDataProxyUplcProgramParameterDatum,
  makeMintingDataV1UplcProgramParameter,
  makeMintingDataV1UplcProgramParameterDatum,
  makeMintProxyUplcProgramParameter,
  makeMintProxyUplcProgramParameterDatum,
};
