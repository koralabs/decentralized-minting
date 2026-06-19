import { invariant } from "../../helpers/index.js";
import {
  BurnProof,
  FreeVirtualData,
  LabelAssetProof,
  LegacyHandleProof,
  MintingData,
  OrderProof,
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

// FreeVirtualData { root_proof, root_free_names: List<ByteArray>, root_labels } (constructor 0).
const buildFreeVirtualData = (fv: FreeVirtualData): PlutusData =>
  mkConstr(0, [
    buildMPTProofData(fv.root_proof),
    mkList(fv.root_free_names.map(mkBytes)),
    mkBytes(fv.root_labels),
  ]);

// Option<FreeVirtualData>: Some(data) = constr 0 / None = constr 1.
const buildOptionFreeVirtualData = (fv?: FreeVirtualData): PlutusData =>
  fv ? mkConstr(0, [buildFreeVirtualData(fv)]) : mkConstr(1, []);

// OrderProof { mpt_proof, free_virtual: Option<FreeVirtualData> } (constructor 0).
const buildOrderProofData = (proof: OrderProof): PlutusData =>
  mkConstr(0, [
    buildMPTProofData(proof.mpt_proof),
    buildOptionFreeVirtualData(proof.free_virtual),
  ]);

// BurnProof { mpt_proof, handle_name, is_virtual, free_virtual: Option<FreeVirtualData> } (constr 0).
const buildBurnProofData = (proof: BurnProof): PlutusData =>
  mkConstr(0, [
    buildMPTProofData(proof.mpt_proof),
    mkBytes(proof.handle_name),
    mkInt(proof.is_virtual),
    buildOptionFreeVirtualData(proof.free_virtual),
  ]);

// LegacyHandleProof { mpt_proof, handle_name, is_virtual } (constructor 0). No free-virtual.
const buildLegacyHandleProofData = (proof: LegacyHandleProof): PlutusData => {
  const { mpt_proof, handle_name, is_virtual } = proof;
  return mkConstr(0, [
    buildMPTProofData(mpt_proof),
    mkBytes(handle_name),
    mkInt(is_virtual),
  ]);
};

// MintDeMiHandles (constructor 0): list of DeMi OrderProofs + minter index.
const buildMintingDataMintDeMiHandlesRedeemer = (
  proofs: OrderProof[],
  minter_index: bigint,
): PlutusData =>
  mkConstr(0, [
    mkList(proofs.map(buildOrderProofData)),
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

// WS1 — LabelAssetProof { mpt_proof, handle_name, label, old_free_names, old_labels, amount } (constr 0).
const buildLabelAssetProofData = (proof: LabelAssetProof): PlutusData => {
  const { mpt_proof, handle_name, label, old_free_names, old_labels, amount } =
    proof;
  return mkConstr(0, [
    buildMPTProofData(mpt_proof),
    mkBytes(handle_name),
    mkBytes(label),
    mkList(old_free_names.map(mkBytes)),
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

// BurnDeMiHandles (constructor 5): list of DeMi BurnProofs (governor + pz gate the actual burn).
const buildMintingDataBurnDeMiHandlesRedeemer = (
  proofs: BurnProof[],
): PlutusData => mkConstr(5, [mkList(proofs.map(buildBurnProofData))]);

export {
  buildBurnProofData,
  buildLabelAssetProofData,
  buildLegacyHandleProofData,
  buildMintingData,
  buildMintingDataBurnLegacyHandlesRedeemer,
  buildMintingDataBurnDeMiHandlesRedeemer,
  buildMintingDataMintLabelAssetsRedeemer,
  buildMintingDataMintLegacyHandlesRedeemer,
  buildMintingDataMintDeMiHandlesRedeemer,
  buildMintingDataUpdateMPTRedeemer,
  buildOrderProofData,
  decodeMintingDataDatum,
};
