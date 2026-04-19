import { invariant } from "../../helpers/index.js";
import { LegacyHandleProof, MintingData, MPTProof } from "../types/index.js";
import { buildMPTProofData } from "./mpt.js";
import {
  expectBytesHex,
  expectConstr,
  mkBytes,
  mkConstr,
  mkInt,
  mkList,
  PlutusData,
  plutusDataFromCbor,
} from "./plutusData.js";

const buildMintingData = (mintingData: MintingData): PlutusData =>
  mkConstr(0, [mkBytes(mintingData.mpt_root_hash)]);

const decodeMintingDataDatum = (
  datumCbor: string | undefined,
): MintingData => {
  invariant(datumCbor, "Minting Data Datum must have inline datum CBOR");
  const data = plutusDataFromCbor(datumCbor);
  const constr = expectConstr(data, 0, 1, "MintingData");
  const mpt_root_hash = expectBytesHex(
    constr.fields.items[0],
    "mpt_root_hash must be ByteArray",
  );
  return { mpt_root_hash };
};

const buildLegacyHandleProofData = (proof: LegacyHandleProof): PlutusData => {
  const { mpt_proof, handle_name, is_virtual } = proof;
  return mkConstr(0, [
    buildMPTProofData(mpt_proof),
    mkBytes(handle_name),
    mkInt(is_virtual),
  ]);
};

const buildMintingDataMintNewHandlesRedeemer = (
  proofs: MPTProof[],
  minter_index: bigint,
): PlutusData =>
  mkConstr(0, [
    mkList(proofs.map(buildMPTProofData)),
    mkInt(minter_index),
  ]);

const buildMintingDataMintLegacyHandlesRedeemer = (
  proofs: LegacyHandleProof[],
): PlutusData => mkConstr(1, [mkList(proofs.map(buildLegacyHandleProofData))]);

const buildMintingDataUpdateMPTRedeemer = (): PlutusData => mkConstr(2, []);

export {
  buildLegacyHandleProofData,
  buildMintingData,
  buildMintingDataMintLegacyHandlesRedeemer,
  buildMintingDataMintNewHandlesRedeemer,
  buildMintingDataUpdateMPTRedeemer,
  decodeMintingDataDatum,
};
