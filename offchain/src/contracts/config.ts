import {
  makeAddress,
  makeAssetClass,
  makeMintingPolicyHash,
  makeRegistrationDCert,
  makeStakingAddress,
  makeStakingValidatorHash,
  makeValidatorHash,
} from "@helios-lang/ledger";
import { NetworkName } from "@helios-lang/tx-utils";

import { GET_CONFIGS } from "../configs/index.js";
import {
  getMintProxyMintUplcProgram,
  getMintV1WithdrawUplcProgram,
  getOrderSpendUplcProgram,
  getSettingsProxyMintUplcProgram,
  getSettingsProxySpendUplcProgram,
  getSettingsV1StakeUplcProgram,
} from "./validators.js";

/**
 * @interface
 * @typedef {object} BuildContractsParams
 * @property {NetworkName} network Cardano Network
 */
interface BuildContractsParams {
  network: NetworkName;
}

/**
 * @description Build Contracts for De-Mi from config
 * @param {BuildContractsParams} params
 * @returns All Contracts
 */
const buildContracts = (params: BuildContractsParams) => {
  const { network } = params;
  const configs = GET_CONFIGS(network);
  const { INITIAL_TX_OUTPUT_ID, SETTINGS_UTF8_ASSET_NAME } = configs;
  const isMainnet = network == "mainnet";

  const settingsProxySpendUplcProgram =
    getSettingsProxySpendUplcProgram(INITIAL_TX_OUTPUT_ID);
  const settingsProxyMintUplcProgram =
    getSettingsProxyMintUplcProgram(INITIAL_TX_OUTPUT_ID);
  const settingsProxyPolicyHash = makeMintingPolicyHash(
    settingsProxyMintUplcProgram.hash()
  );
  const settingsProxyAssetClass = makeAssetClass(
    settingsProxyPolicyHash,
    Buffer.from(SETTINGS_UTF8_ASSET_NAME)
  );
  const settingsProxyScriptAddress = makeAddress(
    isMainnet,
    makeValidatorHash(settingsProxyMintUplcProgram.hash())
  );

  const settingsV1StakeUplcProgram = getSettingsV1StakeUplcProgram();
  const settingsV1ValidatorHash = makeValidatorHash(
    settingsV1StakeUplcProgram.hash()
  );
  const settingsV1StakingAddress = makeStakingAddress(
    isMainnet,
    makeStakingValidatorHash(settingsV1StakeUplcProgram.hash())
  );
  const settingsV1RegistrationDCert = makeRegistrationDCert(
    settingsV1StakingAddress.stakingCredential
  );

  const orderSpendUplcProgram = getOrderSpendUplcProgram(
    settingsProxyPolicyHash.toHex()
  );
  const orderScriptHash = makeValidatorHash(orderSpendUplcProgram.hash());
  const orderScriptAddress = makeAddress(isMainnet, orderScriptHash);

  const mintProxyMintUplcProgram = getMintProxyMintUplcProgram(
    settingsProxyPolicyHash.toHex()
  );
  const mintProxyPolicyHash = makeMintingPolicyHash(
    mintProxyMintUplcProgram.hash()
  );
  const handlePolicyHash = mintProxyPolicyHash;

  const mintV1WithdrawUplcProgram = getMintV1WithdrawUplcProgram(
    settingsProxyPolicyHash.toHex(),
    orderScriptHash.toHex()
  );
  const mintV1ValiatorHash = makeValidatorHash(
    mintV1WithdrawUplcProgram.hash()
  );
  const mintV1StakingAddress = makeStakingAddress(
    isMainnet,
    makeStakingValidatorHash(mintV1WithdrawUplcProgram.hash())
  );
  const mintV1RegistrationDCert = makeRegistrationDCert(
    mintV1StakingAddress.stakingCredential
  );

  return {
    settingsProxy: {
      settingsProxySpendUplcProgram,
      settingsProxyMintUplcProgram,
      settingsProxyPolicyHash,
      settingsProxyAssetClass,
      settingsProxyScriptAddress,
    },
    settingsV1: {
      settingsV1StakeUplcProgram,
      settingsV1ValidatorHash,
      settingsV1StakingAddress,
      settingsV1RegistrationDCert,
    },
    order: {
      orderSpendUplcProgram,
      orderScriptHash,
      orderScriptAddress,
    },
    mintProxy: {
      mintProxyMintUplcProgram,
      mintProxyPolicyHash,
    },
    mintV1: {
      mintV1WithdrawUplcProgram,
      mintV1ValiatorHash,
      mintV1StakingAddress,
      mintV1RegistrationDCert,
    },
    handlePolicyHash,
  };
};

export type { BuildContractsParams };
export { buildContracts };
