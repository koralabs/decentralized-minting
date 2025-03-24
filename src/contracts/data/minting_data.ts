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
import { Proof } from "../types/index.js";
import { makeBoolData } from "./common.js";
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

const buildProofData = (proof: Proof): UplcData => {
  const { mpt_proof, handle_name, is_virtual, amount } = proof;
  return makeConstrData(0, [
    buildMPTProofData(mpt_proof),
    makeByteArrayData(handle_name),
    makeBoolData(is_virtual),
    makeIntData(amount),
  ]);
};

const buildMintingDataMintOrBurnNewHandlesRedeemer = (
  proofs: Proof[]
): UplcData => {
  return makeConstrData(0, [makeListData(proofs.map(buildProofData))]);
};

const buildMintingDataMintOrBurnLegacyHandlesRedeemer = (
  proofs: Proof[]
): UplcData => {
  return makeConstrData(1, [makeListData(proofs.map(buildProofData))]);
};

const buildMintingDataGodModeRedeemer = (): UplcData => {
  return makeConstrData(2, []);
};

export {
  buildMintingData,
  buildMintingDataGodModeRedeemer,
  buildMintingDataMintOrBurnLegacyHandlesRedeemer,
  buildMintingDataMintOrBurnNewHandlesRedeemer,
  decodeMintingDataDatum,
};
