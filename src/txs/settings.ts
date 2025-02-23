import { bytesToHex } from "@helios-lang/codec-utils";
import { NetworkName } from "@helios-lang/tx-utils";
import { Err, Ok, Result } from "ts-res";

import { GET_CONFIGS } from "../configs/index.js";
import {
  buildContracts,
  buildSettingsData,
  buildSettingsV1Data,
  Settings,
  SettingsV1,
} from "../contracts/index.js";
import { mayFail } from "../helpers/index.js";

/**
 * @interface
 * @typedef {object} GetSettingsCBORParams
 * @property {NetworkName} network Network
 */
interface GetSettingsCBORParams {
  network: NetworkName;
}

/**
 * @description Get Settings Data CBOR
 * @param {GetSettingsCBORParams} params
 * @returns {Promise<Result<string,  Error>>} CBOR result
 */

const getSettingsCBOR = async (
  params: GetSettingsCBORParams
): Promise<Result<string, Error>> => {
  const { network } = params;
  const configsResult = mayFail(() => GET_CONFIGS(network));
  if (!configsResult.ok) return Err(new Error(configsResult.error));
  const {
    MINT_VERSION,
    ALLOWED_MINTERS,
    TREASURY_ADDRESS,
    PZ_SCRIPT_ADDRESS,
    TREASURY_FEE,
    MINTER_FEE,
  } = configsResult.data;

  const contractsConfig = buildContracts({
    network,
    mint_version: MINT_VERSION,
  });
  const {
    mintV1: mintV1Config,
    orders: ordersConfig,
    mintingData: mintingDataConfig,
  } = contractsConfig;

  // we already have settings asset using legacy handle.
  const settingsV1: SettingsV1 = {
    policy_id: contractsConfig.handlePolicyHash.toHex(),
    allowed_minters: ALLOWED_MINTERS,
    treasury_address: TREASURY_ADDRESS,
    treasury_fee: TREASURY_FEE,
    minter_fee: MINTER_FEE,
    pz_script_address: PZ_SCRIPT_ADDRESS,
    order_script_hash: ordersConfig.ordersValidatorHash.toHex(),
    minting_data_script_hash:
      mintingDataConfig.mintingDataProxyValidatorHash.toHex(),
  };
  const settings: Settings = {
    mint_governor: mintV1Config.mintV1ValiatorHash.toHex(),
    mint_version: MINT_VERSION,
    data: buildSettingsV1Data(settingsV1),
  };

  return Ok(bytesToHex(buildSettingsData(settings).toCbor()));
};

export { getSettingsCBOR };
export type { GetSettingsCBORParams };
