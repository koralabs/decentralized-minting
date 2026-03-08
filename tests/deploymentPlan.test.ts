import { describe, expect, it, vi } from "vitest";

import {
  buildDeploymentPlan,
  buildExpectedContractStates,
  fetchLiveContractStates,
  fetchLiveSettingsState,
} from "../src/deploymentPlan.js";
import type { DesiredDeploymentState } from "../src/deploymentState.js";

const desiredState: DesiredDeploymentState = {
  schemaVersion: 2,
  network: "preview",
  buildParameters: {
    mintVersion: 0,
    legacyPolicyId: "policy",
    adminVerificationKeyHash: "admin",
  },
  assignedHandles: {
    settings: ["demi@handle_settings", "handle_root@handle_settings", "kora@handle_prices"],
    scripts: ["mint_proxy@demi_scripts", "mint_data_v1@demi_scripts"],
  },
  ignoredSettings: ["settings.values.handle_root@handle_settings.mpt_root_hash"],
  settings: {
    type: "decentralized_minting_settings",
    values: {
      "demi@handle_settings": {
        mint_governor: "0d2b729731ca4db1edf8305572a38a60ab12913e8b83a9f2121be41d",
        mint_version: 0,
        policy_id: "6c32db33a422e0bc2cb535bb850b5a6e9a9572222056d6ddc9cbc26e",
        allowed_minters: ["976ec349c3a14f58959088e13e98f6cd5a1e8f27f6f3160b25e415ca"],
        valid_handle_price_assets: ["f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de1406b6f72614068616e646c655f707269636573"],
        treasury_address: "addr_test1qz96txepzdhj7ryyse0mq9a97eey2es07dydshr9cgapgyv06l2rv7x0p0vtg5kufwj3avaa909ex8uswsnxnad9ccqsyaga0j",
        treasury_fee_percentage: 10,
        pz_script_address: "addr_test1wzzctdyf9nkgrzqw6vxhaq8mpla7zhzjyjmk6txyu0wsgrgek9nj3",
        order_script_hash: "24fe9a2abd4fa926677a65bc8424c755b054790599d4474911a06553",
        minting_data_script_hash: "553de54adecc5c9bfa806cbe0341de9c8a8f8ef13d28e86a81284333",
      },
      "handle_root@handle_settings": {
        mpt_root_hash: "new-root",
      },
      "kora@handle_prices": {
        current_data: [995000000, 445000000, 150000000, 35000000],
        prev_data: [640000000, 320000000, 80000000, 10000000],
      },
    },
  },
  contracts: [
    {
      contractSlug: "demi-mint-proxy",
      scriptType: "demi_mint_proxy",
      deploymentHandleSlug: "demimprxy",
      build: { contractName: "mint_proxy.mint", kind: "minting_policy" },
    },
    {
      contractSlug: "demi-minting-data",
      scriptType: "demi_minting_data",
      deploymentHandleSlug: "demimdata",
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

  it("decodes the live settings handles into comparable YAML-shaped values", async () => {
    const live = await fetchLiveSettingsState({
      network: "preview",
      userAgent: "codex-test",
      fetchFn: vi.fn(async (url) => {
        const target = String(url);
        if (target.endsWith("/handles/demi%40handle_settings")) {
          return new Response(JSON.stringify({
            utxo: "a".repeat(64) + "#0",
            hex: "000de14064656d694068616e646c655f73657474696e6773",
            resolved_addresses: { ada: "addr_test1xqcqk8rej0g79uesql9zfgqvja7ekxra2lnhuzu0c6e5fwpspvw8ny73utenqp72yjsqe9manvv864l80c9cl34ngjuq43c2jv" },
          }), { status: 200 });
        }
        if (target.endsWith("/handles/handle_root%40handle_settings")) {
          return new Response(JSON.stringify({
            utxo: "b".repeat(64) + "#0",
            hex: "000de14068616e646c655f726f6f744068616e646c655f73657474696e6773",
            resolved_addresses: { ada: "addr_test1wp2nme22mmx9exl6spktuq6pm6wg4ruw7y7j36r2sy5yxvcl3hw78" },
          }), { status: 200 });
        }
        if (target.endsWith("/handles/kora%40handle_prices")) {
          return new Response(JSON.stringify({
            utxo: "c".repeat(64) + "#1",
            hex: "000de1406b6f72614068616e646c655f707269636573",
            resolved_addresses: { ada: "addr_test1vqwg4hlph5k947cqt88xlryxk6ufl9qymac33dr4aenmhrqgs8ql0" },
          }), { status: 200 });
        }
        if (target.endsWith("/handles/handle_root%40handle_settings/utxo")) {
          return new Response(JSON.stringify({ lovelace: 1340410 }), { status: 200 });
        }
        if (target.endsWith("/handles/kora%40handle_prices/utxo")) {
          return new Response(JSON.stringify({ lovelace: 1379200 }), { status: 200 });
        }
        if (target.endsWith("/handles/demi%40handle_settings/datum")) {
          return new Response("d8799f581c0d2b729731ca4db1edf8305572a38a60ab12913e8b83a9f2121be41d00d8799f581c6c32db33a422e0bc2cb535bb850b5a6e9a9572222056d6ddc9cbc26e9f581c976ec349c3a14f58959088e13e98f6cd5a1e8f27f6f3160b25e415caff9f9f581cf0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a56000de1406b6f72614068616e646c655f707269636573ffffd8799fd8799f581c8ba59b21136f2f0c84865fb017a5f67245660ff348d85c65c23a1411ffd8799fd8799fd8799f581c8fd7d43678cf0bd8b452dc4ba51eb3bd2bcb931f90742669f5a5c601ffffffff0ad8799fd87a9f581c8585b4892cec81880ed30d7e80fb0ffbe15c5224b76d2cc4e3dd040dffd87a80ff581c24fe9a2abd4fa926677a65bc8424c755b054790599d4474911a06553581c553de54adecc5c9bfa806cbe0341de9c8a8f8ef13d28e86a81284333ffff", { status: 200 });
        }
        if (target.endsWith("/handles/handle_root%40handle_settings/datum")) {
          return new Response("d8799f5820c614162a20649af2093df773ec4bb1c7d957fe79a1d9d586ac5ce0a2506e2209ff", { status: 200 });
        }
        if (target.endsWith("/handles/kora%40handle_prices/datum")) {
          return new Response("d8799f9f1a3b4e7ec01a1a8629401a08f0d1801a02160ec0ff9f1a2625a0001a1312d0001a04c4b4001a00989680ff1b0000019ccb6d2e8fff", { status: 200 });
        }
        throw new Error(`unexpected url ${target}`);
      }) as typeof fetch,
    });

    expect(live.currentSettingsUtxoRefs).toEqual({
      "demi@handle_settings": "a".repeat(64) + "#0",
      "handle_root@handle_settings": "b".repeat(64) + "#0",
      "kora@handle_prices": "c".repeat(64) + "#1",
    });
    expect(live.values).toEqual({
      "demi@handle_settings": {
        mint_governor: "0d2b729731ca4db1edf8305572a38a60ab12913e8b83a9f2121be41d",
        mint_version: 0,
        policy_id: "6c32db33a422e0bc2cb535bb850b5a6e9a9572222056d6ddc9cbc26e",
        allowed_minters: ["976ec349c3a14f58959088e13e98f6cd5a1e8f27f6f3160b25e415ca"],
        valid_handle_price_assets: ["f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de1406b6f72614068616e646c655f707269636573"],
        treasury_address: "addr_test1qz96txepzdhj7ryyse0mq9a97eey2es07dydshr9cgapgyv06l2rv7x0p0vtg5kufwj3avaa909ex8uswsnxnad9ccqsyaga0j",
        treasury_fee_percentage: 10,
        pz_script_address: "addr_test1wzzctdyf9nkgrzqw6vxhaq8mpla7zhzjyjmk6txyu0wsgrgek9nj3",
        order_script_hash: "24fe9a2abd4fa926677a65bc8424c755b054790599d4474911a06553",
        minting_data_script_hash: "553de54adecc5c9bfa806cbe0341de9c8a8f8ef13d28e86a81284333",
      },
      "handle_root@handle_settings": {
        mpt_root_hash: "c614162a20649af2093df773ec4bb1c7d957fe79a1d9d586ac5ce0a2506e2209",
      },
      "kora@handle_prices": {
        current_data: [995000000, 445000000, 150000000, 35000000],
        prev_data: [640000000, 320000000, 80000000, 10000000],
      },
    });
  });

  it("ignores the configured minting-data root while still tracking real drift", () => {
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
      liveSettings: {
        currentSettingsUtxoRefs: {},
        values: {
          ...desiredState.settings.values,
          "handle_root@handle_settings": { mpt_root_hash: "old-root" },
          "kora@handle_prices": { current_data: [1, 2, 3, 4], prev_data: [4, 3, 2, 1] },
        },
      },
    });

    expect(plan.summaryJson.contracts.map((item) => item.drift_type)).toEqual([
      "settings_only",
      "script_hash_and_settings",
    ]);
    expect(plan.summaryJson.contracts[0].settings.diff_rows.map((row) => row.path)).toEqual([
      "kora@handle_prices.current_data",
      "kora@handle_prices.prev_data",
    ]);
  });
});
