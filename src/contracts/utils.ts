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

const makeMintV1UplcProgramParameter = (
  minting_data_script_hash: string
): UplcValue[] => {
  return [makeUplcDataValue(makeByteArrayData(minting_data_script_hash))];
};

const makeMintV1UplcProgramParameterDatum = (
  minting_data_script_hash: string
): InlineTxOutputDatum => {
  return makeInlineTxOutputDatum(
    makeListData([makeByteArrayData(minting_data_script_hash)])
  );
};

const makeMintingDataUplcProgramParameter = (
  legacy_policy_id: string,
  admin_verification_key_hash: string
): UplcValue[] => {
  return [
    makeUplcDataValue(makeByteArrayData(legacy_policy_id)),
    makeUplcDataValue(makeByteArrayData(admin_verification_key_hash)),
  ];
};

const makeMintingDataUplcProgramParameterDatum = (
  legacy_policy_id: string,
  admin_verification_key_hash: string
): InlineTxOutputDatum => {
  return makeInlineTxOutputDatum(
    makeListData([
      makeByteArrayData(legacy_policy_id),
      makeByteArrayData(admin_verification_key_hash),
    ])
  );
};

export {
  makeMintingDataUplcProgramParameter,
  makeMintingDataUplcProgramParameterDatum,
  makeMintProxyUplcProgramParameter,
  makeMintProxyUplcProgramParameterDatum,
  makeMintV1UplcProgramParameter,
  makeMintV1UplcProgramParameterDatum,
};
