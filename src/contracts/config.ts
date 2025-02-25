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
  getMintingDataProxySpendUplcProgram,
  getMintingDataV1WithdrawUplcProgram,
  getMintProxyMintUplcProgram,
  getMintV1WithdrawUplcProgram,
  getOrdersSpendUplcProgram,
} from "./validators.js";

/**
 * @interface
 * @typedef {object} BuildContractsParams
 * @property {NetworkName} network Cardano Network
 * @property {bigint} mint_version De-Mi version
 * @property {string} god_verification_key_hash God Verification Key Hash
 */
interface BuildContractsParams {
  network: NetworkName;
  mint_version: bigint;
  god_verification_key_hash: string;
}

/**
 * @description Build Contracts for De-Mi from config
 * @param {BuildContractsParams} params
 * @returns All Contracts
 */
const buildContracts = (params: BuildContractsParams) => {
  const { network, mint_version, god_verification_key_hash } = params;
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

  const mintingDataV1WithdrawUplcProgram = getMintingDataV1WithdrawUplcProgram(
    god_verification_key_hash
  );
  const mintingDataV1ValidatorHash = makeValidatorHash(
    mintingDataV1WithdrawUplcProgram.hash()
  );
  const mintingDataV1StakingAddress = makeStakingAddress(
    isMainnet,
    makeStakingValidatorHash(mintingDataV1WithdrawUplcProgram.hash())
  );
  const mintingDataV1RegistrationDCert = makeRegistrationDCert(
    mintingDataV1StakingAddress.stakingCredential
  );

  const mintingDataProxySpendUplcProgram = getMintingDataProxySpendUplcProgram(
    mintingDataV1ValidatorHash.toHex()
  );
  const mintingDataProxyValidatorHash = makeValidatorHash(
    mintingDataProxySpendUplcProgram.hash()
  );
  const mintingDataProxyValidatorAddress = makeAddress(
    isMainnet,
    mintingDataProxyValidatorHash
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
    mintingDataProxy: {
      mintingDataProxySpendUplcProgram,
      mintingDataProxyValidatorHash,
      mintingDataProxyValidatorAddress,
    },
    mintingDataV1: {
      mintingDataV1WithdrawUplcProgram,
      mintingDataV1ValidatorHash,
      mintingDataV1StakingAddress,
      mintingDataV1RegistrationDCert,
    },
    handlePolicyHash,
  };
};

export type { BuildContractsParams };
export { buildContracts };
