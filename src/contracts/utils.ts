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
  legacy_policy_id: string,
  god_verification_key_hash: string
): UplcValue[] => {
  return [
    makeUplcDataValue(makeByteArrayData(legacy_policy_id)),
    makeUplcDataValue(makeByteArrayData(god_verification_key_hash)),
  ];
};

const makeMintingDataV1UplcProgramParameterDatum = (
  legacy_policy_id: string,
  god_verification_key_hash: string
): InlineTxOutputDatum => {
  return makeInlineTxOutputDatum(
    makeListData([
      makeByteArrayData(legacy_policy_id),
      makeByteArrayData(god_verification_key_hash),
    ])
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
