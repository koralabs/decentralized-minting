import { describe, expect, it } from "vitest";

import { loadDesiredDeploymentState, parseDesiredDeploymentState } from "../src/deploymentState.js";

describe("decentralized minting deployment state", () => {
  it("loads preview, preprod, and mainnet desired-state YAML fixtures", async () => {
    const preview = await loadDesiredDeploymentState("deploy/preview/decentralized-minting.yaml");
    const preprod = await loadDesiredDeploymentState("deploy/preprod/decentralized-minting.yaml");
    const mainnet = await loadDesiredDeploymentState("deploy/mainnet/decentralized-minting.yaml");

    expect(preview.network).toBe("preview");
    expect(preprod.network).toBe("preprod");
    expect(mainnet.network).toBe("mainnet");
    expect(preview.assignedHandles.settings).toEqual([
      "demi@handle_settings",
      "handle_root@handle_settings",
      "kora@handle_prices",
    ]);
    expect(mainnet.contracts.map((item) => item.contractSlug)).toEqual([
      "demimntprx",
      "demimntmpt",
      "demimnt",
      "demiord",
    ]);
  });

  it("rejects observed-only fields in desired-state YAML", () => {
    expect(() =>
      parseDesiredDeploymentState(`
schema_version: 2
network: preview
current_script_hash: deadbeef
build_parameters:
  mint_version: 0
  legacy_policy_id: aa
  admin_verification_key_hash: bb
assigned_handles:
  settings: [demi@handle_settings]
  scripts: []
ignored_settings: []
settings:
  type: decentralized_minting_settings
  values:
    demi@handle_settings:
      mint_governor: aa
      mint_version: 0
      policy_id: bb
      allowed_minters: []
      valid_handle_price_assets: []
      treasury_address: addr_test1abc
      treasury_fee_percentage: 10
      pz_script_address: addr_test1def
      order_script_hash: cc
      minting_data_script_hash: dd
    handle_root@handle_settings:
      mpt_root_hash: ee
    kora@handle_prices:
      current_data: [1]
      prev_data: [2]
contracts:
  - contract_slug: demimntprx
    script_type: demimntprx
    old_script_type: demi_mint_proxy
    deployment_handle_slug: demimntprx
    build:
      contract_name: demimntprx.mint
      kind: minting_policy
`)
    ).toThrow(/must not include observed-only field `current_script_hash`/);
  });
});
