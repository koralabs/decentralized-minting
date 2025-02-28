import {
  makeAddress,
  makeMintingPolicyHash,
  makeRegistrationDCert,
  makeStakingAddress,
  makeStakingValidatorHash,
  makeValidatorHash,
} from "@helios-lang/ledger";
import { NetworkName } from "@helios-lang/tx-utils";

import {
  getMintingDataSpendUplcProgram,
  getMintProxyMintUplcProgram,
  getMintV1WithdrawUplcProgram,
  getOrdersSpendUplcProgram,
} from "./validators.js";

/**
 * @interface
 * @typedef {object} BuildContractsParams
 * @property {NetworkName} network Cardano Network
 * @property {bigint} mint_version De-Mi version
 * @property {string} legacy_policy_id Legacy Handle's Policy ID
 * @property {string} god_verification_key_hash God Verification Key Hash
 */
interface BuildContractsParams {
  network: NetworkName;
  mint_version: bigint;
  legacy_policy_id: string;
  god_verification_key_hash: string;
}

/**
 * @description Build Contracts for De-Mi from config
 * @param {BuildContractsParams} params
 * @returns All Contracts
 */
const buildContracts = (params: BuildContractsParams) => {
  const { network, mint_version, legacy_policy_id, god_verification_key_hash } =
    params;
  const isMainnet = network == "mainnet";

  const ordersSpendUplcProgram = getOrdersSpendUplcProgram();
  const ordersValidatorHash = makeValidatorHash(ordersSpendUplcProgram.hash());
  const ordersValidatorAddress = makeAddress(isMainnet, ordersValidatorHash);

  const mintProxyMintUplcProgram = getMintProxyMintUplcProgram(mint_version);
  const mintProxyPolicyHash = makeMintingPolicyHash(
    mintProxyMintUplcProgram.hash()
  );
  const handlePolicyHash = mintProxyPolicyHash;

  const mintV1WithdrawUplcProgram = getMintV1WithdrawUplcProgram();
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

  const mintingDataSpendUplcProgram = getMintingDataSpendUplcProgram(
    legacy_policy_id,
    god_verification_key_hash
  );
  const mintingDataValidatorHash = makeValidatorHash(
    mintingDataSpendUplcProgram.hash()
  );
  const mintingDataValidatorAddress = makeAddress(
    isMainnet,
    mintingDataValidatorHash
  );

  return {
    orders: {
      ordersSpendUplcProgram,
      ordersValidatorHash,
      ordersValidatorAddress,
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
    mintingData: {
      mintingDataSpendUplcProgram,
      mintingDataValidatorHash,
      mintingDataValidatorAddress,
    },
    handlePolicyHash,
  };
};

export type { BuildContractsParams };
export { buildContracts };
