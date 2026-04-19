import { ScriptDetails, ScriptType } from "@koralabs/kora-labs-common";
import { Err, Ok, Result } from "ts-res";

import { plutusDataToCbor } from "../contracts/data/plutusData.js";
import {
  buildContracts,
  makeMintingDataUplcProgramParameterDatum,
  makeMintProxyUplcProgramParameterDatum,
  makeMintV1UplcProgramParameterDatum,
} from "../contracts/index.js";
import type { NetworkName } from "../helpers/cardano-sdk/networkName.js";
import { convertError, invariant } from "../helpers/index.js";
import { fetchDeployedScript } from "../utils/contract.js";

/**
 * Inputs to `deploy`. `NetworkName` is now a local literal union — no Helios.
 */
interface DeployParams {
  network: NetworkName;
  /** Mint Version — parameter in the demimntprx.mint validator. */
  mintVersion: bigint;
  /** Legacy handle policy id. */
  legacyPolicyId: string;
  /** Admin verification key hash — parameter in demimntmpt.spend. */
  adminVerificationKeyHash: string;
  /** Which contract blueprint to extract. */
  contractName: string;
}

interface DeployData {
  /** Double-CBOR of the parameterized optimized script. */
  optimizedCbor: string;
  /** Double-CBOR of the parameterized unoptimized script. */
  unOptimizedCbor?: string;
  /** Inline datum CBOR (settings-proxy parameter echo) — when applicable. */
  datumCbor?: string;
  /** Script hash (28-byte hex). */
  validatorHash: string;
  /** Policy id — only set for the mint-proxy. */
  policyId?: string;
  /** Script bech32 address — only set for spending validators. */
  scriptAddress?: string;
  /** Script reward-account — only set for the withdraw validator. */
  scriptStakingAddress?: string;
}

/**
 * Produce the CBORs + datum + hashes for one of the De-Mi validators. The
 * on-chain deployment plan generator consumes this.
 */
const deploy = async (params: DeployParams): Promise<DeployData> => {
  const {
    network,
    mintVersion,
    legacyPolicyId,
    adminVerificationKeyHash,
    contractName,
  } = params;

  const built = buildContracts({
    network,
    mint_version: mintVersion,
    legacy_policy_id: legacyPolicyId,
    admin_verification_key_hash: adminVerificationKeyHash,
  });

  switch (contractName) {
    case "demimntprx.mint":
      return {
        optimizedCbor: built.mintProxy.validator.optimizedCbor,
        unOptimizedCbor: built.mintProxy.validator.unoptimizedCbor,
        datumCbor: plutusDataToCbor(
          makeMintProxyUplcProgramParameterDatum(mintVersion),
        ),
        validatorHash: built.mintProxy.policyId,
        policyId: built.mintProxy.policyId,
      };
    case "demimntmpt.spend":
      return {
        optimizedCbor: built.mintingData.validator.optimizedCbor,
        unOptimizedCbor: built.mintingData.validator.unoptimizedCbor,
        datumCbor: plutusDataToCbor(
          makeMintingDataUplcProgramParameterDatum(
            legacyPolicyId,
            adminVerificationKeyHash,
          ),
        ),
        validatorHash: built.mintingData.validatorHash,
        scriptAddress: built.mintingData.scriptAddress,
      };
    case "demimnt.withdraw":
      return {
        optimizedCbor: built.mintV1.validator.optimizedCbor,
        unOptimizedCbor: built.mintV1.validator.unoptimizedCbor,
        datumCbor: plutusDataToCbor(
          makeMintV1UplcProgramParameterDatum(built.mintingData.validatorHash),
        ),
        validatorHash: built.mintV1.validatorHash,
        scriptStakingAddress: built.mintV1.stakingAddress,
      };
    case "demiord.spend":
      return {
        optimizedCbor: built.orders.validator.optimizedCbor,
        unOptimizedCbor: built.orders.validator.unoptimizedCbor,
        validatorHash: built.orders.validatorHash,
        scriptAddress: built.orders.scriptAddress,
      };
    default:
      throw new Error(
        `Contract name must be one of "demimntprx.mint" | "demimntmpt.spend" | "demimnt.withdraw" | "demiord.spend"`,
      );
  }
};

/**
 * Reference-script UTxO descriptor for a deployed validator. Replaces the
 * Helios `TxInput` with the minimum the tx builders actually need.
 */
export interface DeployedScriptRef {
  details: ScriptDetails;
  refScriptUtxo: { txHash: string; outputIndex: number };
  /** Double-CBOR of the on-chain script (used to recompute hashes). */
  optimizedCbor: string;
  /** Double-CBOR of the off-chain unoptimized fallback if present. */
  unoptimizedCbor?: string;
}

interface DeployedScripts {
  mintProxyScript: DeployedScriptRef;
  mintingDataScript: DeployedScriptRef;
  mintV1Script: DeployedScriptRef;
  ordersScript: DeployedScriptRef;
}

const parseRefUtxo = (
  refScriptUtxo: string,
): { txHash: string; outputIndex: number } => {
  const [txHash, idxStr] = refScriptUtxo.split("#");
  return { txHash, outputIndex: parseInt(idxStr, 10) };
};

const fetchAllDeployedScripts = async (): Promise<
  Result<DeployedScripts, string>
> => {
  try {
    const mintProxyDetails = await fetchDeployedScript(
      ScriptType.DEMI_MINT_PROXY,
    );
    invariant(
      mintProxyDetails.refScriptUtxo,
      "Mint Proxy has no Ref script UTxO",
    );
    const mintProxyScript: DeployedScriptRef = {
      details: mintProxyDetails,
      refScriptUtxo: parseRefUtxo(mintProxyDetails.refScriptUtxo),
      optimizedCbor: mintProxyDetails.cbor ?? "",
      ...(mintProxyDetails.unoptimizedCbor
        ? { unoptimizedCbor: mintProxyDetails.unoptimizedCbor }
        : {}),
    };

    const mintingDataDetails = await fetchDeployedScript(
      ScriptType.DEMI_MINTING_DATA,
    );
    invariant(
      mintingDataDetails.refScriptUtxo,
      "Minting Data has no Ref script UTxO",
    );
    const mintingDataScript: DeployedScriptRef = {
      details: mintingDataDetails,
      refScriptUtxo: parseRefUtxo(mintingDataDetails.refScriptUtxo),
      optimizedCbor: mintingDataDetails.cbor ?? "",
      ...(mintingDataDetails.unoptimizedCbor
        ? { unoptimizedCbor: mintingDataDetails.unoptimizedCbor }
        : {}),
    };

    const mintV1Details = await fetchDeployedScript(ScriptType.DEMI_MINT);
    invariant(
      mintV1Details.refScriptUtxo,
      "Mint V1 has no Ref script UTxO",
    );
    const mintV1Script: DeployedScriptRef = {
      details: mintV1Details,
      refScriptUtxo: parseRefUtxo(mintV1Details.refScriptUtxo),
      optimizedCbor: mintV1Details.cbor ?? "",
      ...(mintV1Details.unoptimizedCbor
        ? { unoptimizedCbor: mintV1Details.unoptimizedCbor }
        : {}),
    };

    const ordersDetails = await fetchDeployedScript(ScriptType.DEMI_ORDERS);
    invariant(
      ordersDetails.refScriptUtxo,
      "Orders has no Ref script UTxO",
    );
    const ordersScript: DeployedScriptRef = {
      details: ordersDetails,
      refScriptUtxo: parseRefUtxo(ordersDetails.refScriptUtxo),
      optimizedCbor: ordersDetails.cbor ?? "",
      ...(ordersDetails.unoptimizedCbor
        ? { unoptimizedCbor: ordersDetails.unoptimizedCbor }
        : {}),
    };

    return Ok({
      mintProxyScript,
      mintingDataScript,
      mintV1Script,
      ordersScript,
    });
  } catch (err) {
    return Err(convertError(err));
  }
};

export type { DeployData, DeployedScripts, DeployParams };
export { deploy, fetchAllDeployedScripts };
