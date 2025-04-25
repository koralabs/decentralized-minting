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
import { MintingData, MPTProof } from "../types/index.js";
import { LegacyHandleProof } from "../types/index.js";
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

const buildLegacyHandleProofData = (proof: LegacyHandleProof): UplcData => {
  const { mpt_proof, handle_name, is_virtual } = proof;
  return makeConstrData(0, [
    buildMPTProofData(mpt_proof),
    makeByteArrayData(handle_name),
    makeIntData(is_virtual),
  ]);
};

const buildMintingDataMintNewHandlesRedeemer = (
  proofs: MPTProof[],
  minter_index: bigint
): UplcData => {
  return makeConstrData(0, [
    makeListData(proofs.map(buildMPTProofData)),
    makeIntData(minter_index),
  ]);
};

const buildMintingDataMintLegacyHandlesRedeemer = (
  proofs: LegacyHandleProof[]
): UplcData => {
  return makeConstrData(1, [
    makeListData(proofs.map(buildLegacyHandleProofData)),
  ]);
};
const buildMintingDataUpdateMPTRedeemer = (): UplcData => {
  return makeConstrData(2, []);
};

export {
  buildLegacyHandleProofData,
  buildMintingData,
  buildMintingDataMintLegacyHandlesRedeemer,
  buildMintingDataMintNewHandlesRedeemer,
  buildMintingDataUpdateMPTRedeemer,
  decodeMintingDataDatum,
};
