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

import { Handle } from "./types/minting_data.js";

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

const makeMintingDataUplcProgramParameter = (
  legacy_policy_id: string,
  god_verification_key_hash: string
): UplcValue[] => {
  return [
    makeUplcDataValue(makeByteArrayData(legacy_policy_id)),
    makeUplcDataValue(makeByteArrayData(god_verification_key_hash)),
  ];
};

const makeMintingDataUplcProgramParameterDatum = (
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

const getHandleName = (handle: Handle): string => {
  if (handle.type == "new") return handle.new_handle_name;
  if (handle.type == "legacy") return handle.legacy_handle_name;
  if (handle.type == "legacy_sub") return handle.legacy_sub_handle_name;
  if (handle.type == "legacy_virtual_sub")
    return handle.legacy_virtual_sub_handle_name;
  throw new Error("Invalid handle type");
};

const getUTF8HandleName = (handle: Handle): string => {
  return Buffer.from(getHandleName(handle), "hex").toString("utf8");
};

export {
  getHandleName,
  getUTF8HandleName,
  makeMintingDataUplcProgramParameter,
  makeMintingDataUplcProgramParameterDatum,
  makeMintProxyUplcProgramParameter,
  makeMintProxyUplcProgramParameterDatum,
};
