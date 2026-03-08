import crypto from "node:crypto";

import { buildContracts } from "./contracts/config.js";
import type { DesiredContractTarget, DesiredDeploymentState } from "./deploymentState.js";

const REPO_NAME = "decentralized-minting";

export interface ExpectedContractState {
  contractSlug: string;
  scriptType: string;
  expectedScriptHash: string;
}

export interface LiveContractState {
  contractSlug: string;
  scriptType: string;
  currentScriptHash: string;
  currentSubhandle: string | null;
}

const handlesApiBaseUrlForNetwork = (network: string): string =>
  network === "preview" ? "https://preview.api.handle.me" : "https://preprod.api.handle.me";

export const buildExpectedContractStates = (
  desired: DesiredDeploymentState,
  buildContractsFn = buildContracts
): ExpectedContractState[] => {
  const built = buildContractsFn({
    network: desired.network,
    mint_version: BigInt(desired.buildParameters.mintVersion),
    legacy_policy_id: desired.buildParameters.legacyPolicyId,
    admin_verification_key_hash: desired.buildParameters.adminVerificationKeyHash,
  });

  return desired.contracts.map((contract) => ({
    contractSlug: contract.contractSlug,
    scriptType: contract.scriptType,
    expectedScriptHash: expectedScriptHashForContract(contract, built),
  }));
};

const expectedScriptHashForContract = (
  contract: DesiredContractTarget,
  built: ReturnType<typeof buildContracts>
): string => {
  switch (contract.build.contractName) {
    case "mint_proxy.mint":
      return built.mintProxy.mintProxyPolicyHash.toHex();
    case "minting_data.spend":
      return built.mintingData.mintingDataValidatorHash.toHex();
    case "mint_v1.withdraw":
      return built.mintV1.mintV1ValidatorHash.toHex();
    case "orders.spend":
      return built.orders.ordersValidatorHash.toHex();
    default:
      throw new Error(`unsupported contract_name \`${contract.build.contractName}\``);
  }
};

export const fetchLiveContractStates = async ({
  network,
  contracts,
  userAgent,
  fetchFn = fetch,
}: {
  network: "preview" | "preprod";
  contracts: DesiredContractTarget[];
  userAgent: string;
  fetchFn?: typeof fetch;
}): Promise<LiveContractState[]> => {
  const baseUrl = handlesApiBaseUrlForNetwork(network);
  return Promise.all(
    contracts.map(async (contract) => {
      const response = await fetchFn(
        `${baseUrl}/scripts?latest=true&type=${encodeURIComponent(contract.scriptType)}`,
        { headers: { "User-Agent": userAgent } }
      );
      if (!response.ok) {
        throw new Error(`failed to load live ${contract.contractSlug} script: HTTP ${response.status}`);
      }
      const payload = await response.json();
      const currentScriptHash = String(payload.validatorHash ?? payload.scriptHash ?? "").trim();
      if (!currentScriptHash) {
        throw new Error(`live ${contract.contractSlug} script response missing validatorHash/scriptHash`);
      }
      return {
        contractSlug: contract.contractSlug,
        scriptType: contract.scriptType,
        currentScriptHash,
        currentSubhandle: String(payload.handle ?? "").trim() || null,
      };
    })
  );
};

export const buildDeploymentPlan = ({
  desired,
  expectedContracts,
  liveContracts,
}: {
  desired: DesiredDeploymentState;
  expectedContracts: ExpectedContractState[];
  liveContracts: LiveContractState[];
}) => {
  const contractEntries = desired.contracts.map((contract) => {
    const expected = expectedContracts.find((item) => item.contractSlug === contract.contractSlug);
    const live = liveContracts.find((item) => item.contractSlug === contract.contractSlug);
    if (!expected || !live) {
      throw new Error(`missing expected/live contract state for ${contract.contractSlug}`);
    }
    const driftType = live.currentScriptHash === expected.expectedScriptHash ? "no_change" : "script_hash_only";
    return {
      contract_slug: contract.contractSlug,
      script_type: contract.scriptType,
      drift_type: driftType,
      script_hashes: {
        current: live.currentScriptHash,
        expected: expected.expectedScriptHash,
      },
      subhandle: {
        action: driftType === "no_change" ? "reuse" : "manual_review",
        value: live.currentSubhandle,
      },
      expected_post_deploy_state: {
        repo: REPO_NAME,
        network: desired.network,
        contract_slug: contract.contractSlug,
        expected_script_hash: expected.expectedScriptHash,
        expected_subhandle: driftType === "no_change" ? live.currentSubhandle : null,
      },
    };
  });

  const planId = crypto.createHash("sha256").update(JSON.stringify({
    network: desired.network,
    build_parameters: desired.buildParameters,
    contracts: contractEntries.map((entry) => ({
      contract_slug: entry.contract_slug,
      current: entry.script_hashes.current,
      expected: entry.script_hashes.expected,
    })),
  })).digest("hex");

  const summaryJson = {
    plan_id: planId,
    repo: REPO_NAME,
    network: desired.network,
    contracts: contractEntries,
    transaction_order: [],
  };

  const summaryMarkdown = [
    "# Contract Deployment Plan",
    "",
    `- Plan ID: \`${planId}\``,
    `- Repo: \`${REPO_NAME}\``,
    `- Network: \`${desired.network}\``,
    "",
    "## Contract Drift",
    ...contractEntries.flatMap((entry) => [
      `- \`${entry.contract_slug}\`: \`${entry.drift_type}\``,
      `  - Script Hash: \`${entry.script_hashes.current}\` -> \`${entry.script_hashes.expected}\``,
      `  - Handle: \`${entry.subhandle.value || ""}\``,
      ...(entry.subhandle.action === "manual_review"
        ? ["  - Operator review required for replacement deployment handle namespace."]
        : []),
    ]),
    "",
    "## Transaction Order",
    "- No transaction artifact is generated for this repo yet.",
  ].join("\n");

  return {
    planId,
    summaryJson,
    summaryMarkdown,
    deploymentPlanJson: {
      plan_id: planId,
      repo: REPO_NAME,
      network: desired.network,
      contracts: contractEntries.map((entry) => entry.expected_post_deploy_state),
      transaction_order: [],
    },
  };
};
