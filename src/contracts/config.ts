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
 * @property {string} admin_verification_key_hash Admin Verification Key Hash
 */
interface BuildContractsParams {
  network: NetworkName;
  mint_version: bigint;
  legacy_policy_id: string;
  admin_verification_key_hash: string;
}

/**
 * @description Build Contracts for De-Mi from config
 * @param {BuildContractsParams} params
 * @returns All Contracts
 */
const buildContracts = (params: BuildContractsParams) => {
  const {
    network,
    mint_version,
    legacy_policy_id,
    admin_verification_key_hash,
  } = params;
  const isMainnet = network == "mainnet";

  // "mint_proxy.mint"
  const mintProxyMintUplcProgram = getMintProxyMintUplcProgram(mint_version);
  const mintProxyPolicyHash = makeMintingPolicyHash(
    mintProxyMintUplcProgram.hash()
  );
  const handlePolicyHash = mintProxyPolicyHash;

  // "minting_data.spend"
  const mintingDataSpendUplcProgram = getMintingDataSpendUplcProgram(
    legacy_policy_id,
    admin_verification_key_hash
  );
  const mintingDataValidatorHash = makeValidatorHash(
    mintingDataSpendUplcProgram.hash()
  );
  const mintingDataValidatorAddress = makeAddress(
    isMainnet,
    mintingDataValidatorHash
  );

  // "mint_v1.withdraw"
  const mintV1WithdrawUplcProgram = getMintV1WithdrawUplcProgram(
    mintingDataValidatorHash.toHex()
  );
  const mintV1ValidatorHash = makeValidatorHash(
    mintV1WithdrawUplcProgram.hash()
  );
  const mintV1StakingAddress = makeStakingAddress(
    isMainnet,
    makeStakingValidatorHash(mintV1WithdrawUplcProgram.hash())
  );
  const mintV1RegistrationDCert = makeRegistrationDCert(
    mintV1StakingAddress.stakingCredential
  );

  // "orders.spend"
  const ordersSpendUplcProgram = getOrdersSpendUplcProgram();
  const ordersValidatorHash = makeValidatorHash(ordersSpendUplcProgram.hash());
  const ordersValidatorAddress = makeAddress(isMainnet, ordersValidatorHash);

  return {
    mintProxy: {
      mintProxyMintUplcProgram,
      mintProxyPolicyHash,
    },
    mintingData: {
      mintingDataSpendUplcProgram,
      mintingDataValidatorHash,
      mintingDataValidatorAddress,
    },
    mintV1: {
      mintV1WithdrawUplcProgram,
      mintV1ValidatorHash,
      mintV1StakingAddress,
      mintV1RegistrationDCert,
    },
    orders: {
      ordersSpendUplcProgram,
      ordersValidatorHash,
      ordersValidatorAddress,
    },
    handlePolicyHash,
  };
};

export type { BuildContractsParams };
export { buildContracts };
