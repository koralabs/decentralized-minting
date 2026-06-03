import { invariant } from "../../helpers/index.js";
import {
  FreeVirtualData,
  LabelAssetProof,
  LegacyHandleProof,
  MintingData,
  MPTProof,
} from "../types/index.js";
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

const buildFreeVirtualData = (fv: FreeVirtualData): PlutusData =>
  mkConstr(0, [
    buildMPTProofData(fv.root_proof),
    mkInt(fv.root_pre_count),
    mkBytes(fv.root_labels),
  ]);

const buildLegacyHandleProofData = (proof: LegacyHandleProof): PlutusData => {
  const { mpt_proof, handle_name, is_virtual, free_virtual } = proof;
  return mkConstr(0, [
    buildMPTProofData(mpt_proof),
    mkBytes(handle_name),
    mkInt(is_virtual),
    // Option<FreeVirtualData>: Some(data) / None
    free_virtual ? mkConstr(0, [buildFreeVirtualData(free_virtual)]) : mkConstr(1, []),
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

// WS2 — BurnLegacyHandles (constructor 3): same proof shape as the legacy mint, amount -1.
const buildMintingDataBurnLegacyHandlesRedeemer = (
  proofs: LegacyHandleProof[],
): PlutusData => mkConstr(3, [mkList(proofs.map(buildLegacyHandleProofData))]);

// WS1 — LabelAssetProof: { mpt_proof, handle_name, label, old_value, amount } (constructor 0).
const buildLabelAssetProofData = (proof: LabelAssetProof): PlutusData => {
  const { mpt_proof, handle_name, label, old_free_virtual_count, old_labels, amount } =
    proof;
  return mkConstr(0, [
    buildMPTProofData(mpt_proof),
    mkBytes(handle_name),
    mkBytes(label),
    mkInt(old_free_virtual_count),
    mkBytes(old_labels),
    mkInt(amount),
  ]);
};

// WS1 — MintLabelAssets (constructor 4): list of label-asset proofs + minter index.
const buildMintingDataMintLabelAssetsRedeemer = (
  proofs: LabelAssetProof[],
  minter_index: bigint,
): PlutusData =>
  mkConstr(4, [
    mkList(proofs.map(buildLabelAssetProofData)),
    mkInt(minter_index),
  ]);

export {
  buildLabelAssetProofData,
  buildLegacyHandleProofData,
  buildMintingData,
  buildMintingDataBurnLegacyHandlesRedeemer,
  buildMintingDataMintLabelAssetsRedeemer,
  buildMintingDataMintLegacyHandlesRedeemer,
  buildMintingDataMintNewHandlesRedeemer,
  buildMintingDataUpdateMPTRedeemer,
  decodeMintingDataDatum,
};
