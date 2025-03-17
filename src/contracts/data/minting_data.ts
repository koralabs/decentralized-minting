import { TxOutputDatum } from "@helios-lang/ledger";
import {
  expectByteArrayData,
  expectConstrData,
  makeByteArrayData,
  makeConstrData,
  makeIntData,
  makeListData,
  UplcData,
} from "@helios-lang/uplc";

import { invariant } from "../../helpers/index.js";
import { MintingData } from "../types/index.js";
import { Handle, Proof } from "../types/index.js";
import { buildMPTProofData } from "./mpt.js";

const buildMintingData = (mintingData: MintingData): UplcData => {
  return makeConstrData(0, [makeByteArrayData(mintingData.mpt_root_hash)]);
};

const decodeMintingDataDatum = (
  datum: TxOutputDatum | undefined
): MintingData => {
  invariant(
    datum?.kind == "InlineTxOutputDatum",
    "Minting Data Datum must be inline datum"
  );
  const datumData = datum.data;
  const mintingDataConstrData = expectConstrData(datumData, 0, 1);

  const mpt_root_hash = expectByteArrayData(
    mintingDataConstrData.fields[0],
    "mpt_root_hash must be ByteArray"
  ).toHex();

  return { mpt_root_hash };
};

const buildHandleData = (handle: Handle): UplcData => {
  if (handle.type == "legacy")
    return makeConstrData(0, [makeByteArrayData(handle.legacy_handle_name)]);
  if (handle.type == "legacy_sub")
    return makeConstrData(1, [
      makeByteArrayData(handle.legacy_sub_handle_name),
      makeByteArrayData(handle.legacy_root_handle_name),
    ]);
  if (handle.type == "legacy_virtual_sub")
    return makeConstrData(2, [
      makeByteArrayData(handle.legacy_virtual_sub_handle_name),
      makeByteArrayData(handle.legacy_root_handle_name),
    ]);
  if (handle.type == "new")
    return makeConstrData(3, [makeByteArrayData(handle.new_handle_name)]);
  else throw new Error("Invalid handle type");
};

const buildProofData = (proof: Proof): UplcData => {
  const { mpt_proof, handle, amount } = proof;
  return makeConstrData(0, [
    buildMPTProofData(mpt_proof),
    buildHandleData(handle),
    makeIntData(amount),
  ]);
};

const buildMintingDataMintOrBurnRedeemer = (proofs: Proof[]): UplcData => {
  return makeConstrData(0, [makeListData(proofs.map(buildProofData))]);
};

const buildMintingDataGodModeRedeemer = (): UplcData => {
  return makeConstrData(1, []);
};

export {
  buildMintingData,
  buildMintingDataGodModeRedeemer,
  buildMintingDataMintOrBurnRedeemer,
  decodeMintingDataDatum,
};
