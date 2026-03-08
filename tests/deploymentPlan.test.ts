import { describe, expect, it, vi } from "vitest";

import {
  buildDeploymentPlan,
  buildExpectedContractStates,
  fetchLiveContractStates,
} from "../src/deploymentPlan.js";
import type { DesiredDeploymentState } from "../src/deploymentState.js";

const desiredState: DesiredDeploymentState = {
  schemaVersion: 1,
  network: "preview",
  buildParameters: {
    mintVersion: 0,
    legacyPolicyId: "policy",
    adminVerificationKeyHash: "admin",
  },
  contracts: [
    {
      contractSlug: "demi-mint-proxy",
      scriptType: "demi_mint_proxy",
      build: { contractName: "mint_proxy.mint", kind: "minting_policy" },
    },
    {
      contractSlug: "demi-minting-data",
      scriptType: "demi_minting_data",
      build: { contractName: "minting_data.spend", kind: "validator" },
    },
  ],
};

describe("decentralized minting deployment plan", () => {
  it("derives expected script hashes from buildContracts output", () => {
    const expected = buildExpectedContractStates(desiredState, vi.fn(() => ({
      mintProxy: { mintProxyPolicyHash: { toHex: () => "aa" } },
      mintingData: { mintingDataValidatorHash: { toHex: () => "bb" } },
      mintV1: { mintV1ValidatorHash: { toHex: () => "cc" } },
      orders: { ordersValidatorHash: { toHex: () => "dd" } },
    })) as never);

    expect(expected).toEqual([
      { contractSlug: "demi-mint-proxy", scriptType: "demi_mint_proxy", expectedScriptHash: "aa" },
      { contractSlug: "demi-minting-data", scriptType: "demi_minting_data", expectedScriptHash: "bb" },
    ]);
  });

  it("fetches live scripts for each desired contract", async () => {
    const live = await fetchLiveContractStates({
      network: "preview",
      contracts: desiredState.contracts,
      userAgent: "codex-test",
      fetchFn: vi.fn(async (url) => {
        if (String(url).includes("demi_mint_proxy")) {
          return new Response(JSON.stringify({ validatorHash: "aa", handle: "mint_proxy@demi_scripts" }), { status: 200 });
        }
        return new Response(JSON.stringify({ validatorHash: "bb", handle: "mint_data_v1@demi_scripts" }), { status: 200 });
      }) as typeof fetch,
    });

    expect(live).toEqual([
      { contractSlug: "demi-mint-proxy", scriptType: "demi_mint_proxy", currentScriptHash: "aa", currentSubhandle: "mint_proxy@demi_scripts" },
      { contractSlug: "demi-minting-data", scriptType: "demi_minting_data", currentScriptHash: "bb", currentSubhandle: "mint_data_v1@demi_scripts" },
    ]);
  });

  it("builds per-contract script drift summary entries", () => {
    const plan = buildDeploymentPlan({
      desired: desiredState,
      expectedContracts: [
        { contractSlug: "demi-mint-proxy", scriptType: "demi_mint_proxy", expectedScriptHash: "aa" },
        { contractSlug: "demi-minting-data", scriptType: "demi_minting_data", expectedScriptHash: "bb" },
      ],
      liveContracts: [
        { contractSlug: "demi-mint-proxy", scriptType: "demi_mint_proxy", currentScriptHash: "aa", currentSubhandle: "mint_proxy@demi_scripts" },
        { contractSlug: "demi-minting-data", scriptType: "demi_minting_data", currentScriptHash: "cc", currentSubhandle: "mint_data_v1@demi_scripts" },
      ],
    });

    expect(plan.summaryJson.contracts.map((item) => item.drift_type)).toEqual([
      "no_change",
      "script_hash_only",
    ]);
    expect(plan.summaryMarkdown).toContain("demi-minting-data");
    expect(plan.summaryMarkdown).toContain("Operator review required");
  });
});
