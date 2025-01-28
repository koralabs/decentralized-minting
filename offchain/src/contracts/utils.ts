import { TxOutputId } from "@helios-lang/ledger";
import {
  makeByteArrayData,
  makeConstrData,
  makeIntData,
  makeUplcDataValue,
  UplcValue,
} from "@helios-lang/uplc";

const makeMintProxyMintUplcProgramParameter = (
  settingsPolicyId: string
): UplcValue[] => {
  return [makeUplcDataValue(makeByteArrayData(settingsPolicyId))];
};

const makeMintV1WithdrawUplcProgramParamter = (
  settingsPolicyId: string,
  orderScriptHash: string
): UplcValue[] => {
  return [
    makeUplcDataValue(makeByteArrayData(settingsPolicyId)),
    makeUplcDataValue(makeByteArrayData(orderScriptHash)),
  ];
};

const makeOrderSpendUplcProgramParameter = (
  settingsPolicyId: string
): UplcValue[] => {
  return [makeUplcDataValue(makeByteArrayData(settingsPolicyId))];
};

const makeSettingsProxySpendUplcProgramParamter = (
  initialTxOutputId: TxOutputId
): UplcValue[] => {
  return [
    makeUplcDataValue(
      makeConstrData(0, [
        makeConstrData(0, [makeByteArrayData(initialTxOutputId.txId.toHex())]),
        makeIntData(initialTxOutputId.index),
      ])
    ),
  ];
};

const makeSettingsProxyMintUplcProgramParamter = (
  initialTxOutputId: TxOutputId
): UplcValue[] => {
  return [
    makeUplcDataValue(
      makeConstrData(0, [
        makeConstrData(0, [makeByteArrayData(initialTxOutputId.txId.toHex())]),
        makeIntData(initialTxOutputId.index),
      ])
    ),
  ];
};

export {
  makeMintProxyMintUplcProgramParameter,
  makeMintV1WithdrawUplcProgramParamter,
  makeOrderSpendUplcProgramParameter,
  makeSettingsProxyMintUplcProgramParamter,
  makeSettingsProxySpendUplcProgramParamter,
};
