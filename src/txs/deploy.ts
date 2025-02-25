import { bytesToHex } from "@helios-lang/codec-utils";
import { NetworkName } from "@helios-lang/tx-utils";
import { UplcProgramV2 } from "@helios-lang/uplc";

import {
  buildContracts,
  makeMintingDataProxyUplcProgramParameterDatum,
  makeMintingDataV1UplcProgramParameterDatum,
  makeMintProxyUplcProgramParameterDatum,
} from "../contracts/index.js";

/**
 * @interface
 * @typedef {object} DeployParams
 * @property {NetworkName} network Network
 * @property {bigint} mintVersion Mint Version - Parameter in Mint Proxy validator
 * @property {string} godVerificationKeyHash God Verification Key  Hash - Parameter in Minting Data V1 Validator
 * @property {string} contractName Contract Name to Deploy
 */
interface DeployParams {
  network: NetworkName;
  mintVersion: bigint;
  godVerificationKeyHash: string;
  contractName: string;
}

interface DeployData {
  optimizedCbor: string;
  unOptimizedCbor?: string;
  datumCbor?: string;
}

/**
 * @description Deploy one of De-Mi contracts
 * @param {DeployParams} params
 * @returns {Promise<DeployData>} Deploy Data
 */
const deploy = async (params: DeployParams): Promise<DeployData> => {
  const { network, mintVersion, godVerificationKeyHash, contractName } = params;

  const contractsConfig = buildContracts({
    network,
    mint_version: mintVersion,
    god_verification_key_hash: godVerificationKeyHash,
  });
  const {
    mintProxy: mintProxyConfig,
    mintV1: mintV1Config,
    mintingDataProxy: mintingDataProxyConfig,
    mintingDataV1: mintingDataV1Config,
    orders: ordersConfig,
  } = contractsConfig;

  switch (contractName) {
    case "mint_proxy.mint":
      return {
        ...extractScriptCborsFromUplcProgram(
          mintProxyConfig.mintProxyMintUplcProgram
        ),
        datumCbor: bytesToHex(
          makeMintProxyUplcProgramParameterDatum(mintVersion).data.toCbor()
        ),
      };
    case "mint_v1.withdraw":
      return {
        ...extractScriptCborsFromUplcProgram(
          mintV1Config.mintV1WithdrawUplcProgram
        ),
      };
    case "minting_data_proxy.spend":
      return {
        ...extractScriptCborsFromUplcProgram(
          mintingDataProxyConfig.mintingDataProxySpendUplcProgram
        ),
        datumCbor: bytesToHex(
          makeMintingDataProxyUplcProgramParameterDatum(
            mintingDataV1Config.mintingDataV1ValidatorHash.toHex()
          ).data.toCbor()
        ),
      };
    case "minting_data_v1.withdraw":
      return {
        ...extractScriptCborsFromUplcProgram(
          mintingDataV1Config.mintingDataV1WithdrawUplcProgram
        ),
        datumCbor: bytesToHex(
          makeMintingDataV1UplcProgramParameterDatum(
            godVerificationKeyHash
          ).data.toCbor()
        ),
      };
    case "orders.spend":
      return {
        ...extractScriptCborsFromUplcProgram(
          ordersConfig.ordersSpendUplcProgram
        ),
      };
    default:
      throw new Error(
        `Contract name must be one of "mint_proxy.mint" | "mint_v1.withdraw" | "minting_data_proxy.spend" | "minting_data_v1.withdraw" | "orders.spend"`
      );
  }
};

const extractScriptCborsFromUplcProgram = (
  uplcProgram: UplcProgramV2
): { optimizedCbor: string; upOptimizedCbor?: string } => {
  return {
    optimizedCbor: bytesToHex(uplcProgram.toCbor()),
    upOptimizedCbor: uplcProgram.alt
      ? bytesToHex(uplcProgram.alt.toCbor())
      : undefined,
  };
};

export type { DeployParams };
export { deploy };
