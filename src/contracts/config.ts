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
  getMintProxyMintUplcProgram,
  getMintV1WithdrawUplcProgram,
  getOrderSpendUplcProgram,
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
  const isMainnet = network == "mainnet";

  const orderSpendUplcProgram = getOrderSpendUplcProgram();
  const orderScriptHash = makeValidatorHash(orderSpendUplcProgram.hash());
  const orderScriptAddress = makeAddress(isMainnet, orderScriptHash);

  const mintProxyMintUplcProgram = getMintProxyMintUplcProgram();
  const mintProxyPolicyHash = makeMintingPolicyHash(
    mintProxyMintUplcProgram.hash()
  );
  const handlePolicyHash = mintProxyPolicyHash;

  const mintV1WithdrawUplcProgram = getMintV1WithdrawUplcProgram(
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
