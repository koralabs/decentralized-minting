import type { PlutusDataJson } from "../helpers/cardano-sdk/scriptParams.js";
import {
  mkBytes,
  mkConstr,
  mkInt,
  mkList,
  PlutusData,
} from "./data/plutusData.js";

const makeMintProxyUplcProgramParameter = (
  mint_version: bigint,
): PlutusDataJson[] => [{ int: Number(mint_version) }];

const makeMintProxyUplcProgramParameterDatum = (
  mint_version: bigint,
): PlutusData => mkList([mkInt(mint_version)]);

const makeMintV1UplcProgramParameter = (
  minting_data_script_hash: string,
): PlutusDataJson[] => [{ bytes: minting_data_script_hash }];

const makeMintV1UplcProgramParameterDatum = (
  minting_data_script_hash: string,
): PlutusData => mkList([mkBytes(minting_data_script_hash)]);

const makeMintingDataUplcProgramParameter = (
  legacy_policy_id: string,
  admin_verification_key_hash: string,
  // WS7 slot->POSIX anchor (network-specific): anchor_slot, anchor_time_ms, slot_length_ms
  anchor_slot: number,
  anchor_time_ms: number,
  slot_length_ms: number,
): PlutusDataJson[] => [
  { bytes: legacy_policy_id },
  { bytes: admin_verification_key_hash },
  { int: anchor_slot },
  { int: anchor_time_ms },
  { int: slot_length_ms },
];

const makeMintingDataUplcProgramParameterDatum = (
  legacy_policy_id: string,
  admin_verification_key_hash: string,
  anchor_slot: number,
  anchor_time_ms: number,
  slot_length_ms: number,
): PlutusData =>
  mkList([
    mkBytes(legacy_policy_id),
    mkBytes(admin_verification_key_hash),
    mkInt(anchor_slot),
    mkInt(anchor_time_ms),
    mkInt(slot_length_ms),
  ]);

// Constructor-flavoured versions (tag=0) for the settings-proxy data shape
// used by the root demimntprx handle reference output.
const makeMintProxyConstrParameterDatum = (
  mint_version: bigint,
): PlutusData => mkConstr(0, [mkInt(mint_version)]);

export {
  makeMintingDataUplcProgramParameter,
  makeMintingDataUplcProgramParameterDatum,
  makeMintProxyConstrParameterDatum,
  makeMintProxyUplcProgramParameter,
  makeMintProxyUplcProgramParameterDatum,
  makeMintV1UplcProgramParameter,
  makeMintV1UplcProgramParameterDatum,
};
