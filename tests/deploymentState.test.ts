import { describe, expect, it } from "vitest";

import { loadDesiredDeploymentState, parseDesiredDeploymentState } from "../src/deploymentState.js";

describe("decentralized minting deployment state", () => {
  it("loads preview and preprod desired-state YAML fixtures", async () => {
    const preview = await loadDesiredDeploymentState("deploy/preview/decentralized-minting.yaml");
    const preprod = await loadDesiredDeploymentState("deploy/preprod/decentralized-minting.yaml");

    expect(preview.network).toBe("preview");
    expect(preprod.network).toBe("preprod");
    expect(preview.contracts.map((item) => item.contractSlug)).toEqual([
      "demi-mint-proxy",
      "demi-minting-data",
      "demi-mint",
      "demi-orders",
    ]);
  });

  it("rejects observed-only fields in desired-state YAML", () => {
    expect(() =>
      parseDesiredDeploymentState(`
schema_version: 1
network: preview
current_script_hash: deadbeef
build_parameters:
  mint_version: 0
  legacy_policy_id: aa
  admin_verification_key_hash: bb
contracts:
  - contract_slug: demi-mint-proxy
    script_type: demi_mint_proxy
    build:
      contract_name: mint_proxy.mint
      kind: minting_policy
`)
    ).toThrow(/must not include observed-only field `current_script_hash`/);
  });
});
