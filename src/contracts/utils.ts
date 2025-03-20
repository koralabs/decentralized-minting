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
  if (typeof handle === "string") return handle;
  return handle.handle_name;
};

const getUTF8HandleName = (handle: Handle): string => {
  if (typeof handle === "string")
    return Buffer.from(handle, "hex").toString("utf8");
  return Buffer.from(handle.handle_name, "hex").toString("utf8");
};

const getIsVirtual = (handle: Handle): boolean => {
  if (typeof handle === "string") return false;
  return handle.is_virtual;
};

const parseHandle = (
  handle: Handle
): { handleName: string; handleUTF8Name: string; isVirtual: boolean } => {
  return {
    handleName: getHandleName(handle),
    handleUTF8Name: getUTF8HandleName(handle),
    isVirtual: getIsVirtual(handle),
  };
};

export {
  getHandleName,
  getIsVirtual,
  getUTF8HandleName,
  makeMintingDataUplcProgramParameter,
  makeMintingDataUplcProgramParameterDatum,
  makeMintProxyUplcProgramParameter,
  makeMintProxyUplcProgramParameterDatum,
  parseHandle,
};
