import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { Trie } from "@aiken-lang/merkle-patricia-forestry";

const execFileP = promisify(execFile);

import { buildContracts } from "./contracts/config.js";
import {
  decodeHandlePriceInfoDatum,
  decodeMintingDataDatum,
  decodeSettingsDatum,
  decodeSettingsV1Data,
} from "./contracts/index.js";
import type { DesiredContractTarget, DesiredDeploymentState } from "./deploymentState.js";
import { buildReferenceScriptDeploymentTx, buildSettingsUpdateTx, type DeployerWallet } from "./deploymentTx.js";

const REPO_NAME = "decentralized-minting";
const DEMI_SETTINGS_HANDLE = "demi@handle_settings";
const MINTING_DATA_HANDLE = "handle_root@handle_settings";
const HANDLE_PRICE_HANDLE = "kora@handle_prices";

/**
 * Compute the MPT root hash by fetching all handles from the API and
 * building a fresh trie. No ghost handles — the migration is the
 * opportunity to set the on-chain root to match the real handle set.
 */
export const computeMptRootHash = async ({
  network,
  userAgent,
  fetchFn = fetch,
}: {
  network: "preview" | "preprod" | "mainnet";
  userAgent: string;
  fetchFn?: typeof fetch;
}): Promise<string> => {
  const baseUrl = handlesApiBaseUrlForNetwork(network);
  const handles: string[] = [];
  let page = 1;
  let searchTotal = 0;

  while (handles.length < searchTotal || page === 1) {
    const response = await fetchFn(
      `${baseUrl}/handles?records_per_page=50000&page=${page}&sort=asc`,
      { headers: { Accept: "text/plain", "User-Agent": userAgent } }
    );
    if (!response.ok) {
      throw new Error(`failed to fetch handles page ${page}: HTTP ${response.status}`);
    }
    const text = await response.text();
    const pageHandles = text.split("\n").filter(Boolean);
    handles.push(...pageHandles);

    const totalHeader = response.headers.get("x-handles-search-total");
    searchTotal = totalHeader && Number.isFinite(Number(totalHeader)) ? Number(totalHeader) : handles.length;
    if (!pageHandles.length) break;
    page++;
  }

  const trieList = handles.map((h) => ({ key: h, value: "" }));
  const trie = await Trie.fromList(trieList);
  return trie.hash.toString("hex");
};

/**
 * Fetch the old (currently deployed) validator script CBOR from the Handle
 * API's /script endpoint for the given deployment subhandle.
 */
export const fetchOldValidatorCbor = async ({
  network,
  currentSubhandle,
  userAgent,
  fetchFn = fetch,
}: {
  network: "preview" | "preprod" | "mainnet";
  currentSubhandle: string;
  userAgent: string;
  fetchFn?: typeof fetch;
}): Promise<string> => {
  const baseUrl = handlesApiBaseUrlForNetwork(network);
  const response = await fetchFn(
    `${baseUrl}/handles/${encodeURIComponent(currentSubhandle)}/script`,
    { headers: { "User-Agent": userAgent } }
  );
  if (!response.ok) {
    throw new Error(`failed to fetch script for ${currentSubhandle}: HTTP ${response.status}`);
  }
  const payload = await response.json() as { cbor?: string };
  if (!payload.cbor) {
    throw new Error(`no CBOR in script response for ${currentSubhandle}`);
  }
  return payload.cbor;
};

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

export interface UnsignedDeploymentTxArtifact {
  cborBytes: Buffer;
  cborHex: string;
  estimatedSignedTxSize: number;
  maxTxSize: number;
  consumedInputs: Set<string>;
}

export const renderTransactionOrderMarkdown = (transactionOrder: string[]) =>
  transactionOrder.length > 0
    ? transactionOrder.map((fileName) => `- \`${fileName}\``)
    : ["- No transaction artifacts generated (no drift detected or Blockfrost API key unavailable)."];

// Locate the canonical Python helper that owns SubHandle ordinal discovery.
// Authoritative source: https://github.com/koralabs/adahandle-deployments/blob/master/common/discover_subhandles.py
//
// Resolution order: DISCOVER_SUBHANDLES_PATH env, $ADAHANDLE_DEPLOYMENTS_PATH/common,
// then ../adahandle-deployments/common/. Throws if none resolve so callers
// can't accidentally fall back to a stale local implementation.
const resolveDiscoverSubhandlesScript = (): string => {
  const explicit = process.env.DISCOVER_SUBHANDLES_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const deployRoot = process.env.ADAHANDLE_DEPLOYMENTS_PATH;
  if (deployRoot) {
    const candidate = path.join(deployRoot, "common", "discover_subhandles.py");
    if (fs.existsSync(candidate)) return candidate;
  }
  const sibling = path.resolve("..", "adahandle-deployments", "common", "discover_subhandles.py");
  if (fs.existsSync(sibling)) return sibling;
  throw new Error(
    "discover_subhandles.py not found. Set DISCOVER_SUBHANDLES_PATH or ADAHANDLE_DEPLOYMENTS_PATH, " +
    "or check out koralabs/adahandle-deployments alongside this repo. " +
    "See docs at https://github.com/koralabs/adahandle-deployments/blob/master/docs/contract-deployment-pipeline.md#replacement-handle-allocation"
  );
};

// Discover the next SubHandle ordinal for one contract slug.
//
// Delegates to the canonical Python implementation at
// `adahandle-deployments/common/discover_subhandles.py`. This wrapper just
// shells out and parses the result so every Kora contract repo gets
// identical ordinal-reuse behavior. Do NOT add a local fallback — the rule
// is "one source of truth, in adahandle-deployments."
const discoverOneSubhandle = async ({
  network,
  deploymentHandleSlug,
  currentSubhandle,
  userAgent,
}: {
  network: "preview" | "preprod" | "mainnet";
  deploymentHandleSlug: string;
  currentSubhandle?: string | null;
  userAgent: string;
}): Promise<string> => {
  const scriptPath = resolveDiscoverSubhandlesScript();
  const args = [
    scriptPath,
    "--slug", deploymentHandleSlug,
    "--network", network,
    "--namespace", "handlecontract",
    "--user-agent", userAgent,
  ];
  if (currentSubhandle) {
    args.push("--current-subhandle", currentSubhandle);
  }
  const { stdout } = await execFileP("python3", args, { encoding: "utf8" });
  const result = stdout.trim();
  if (!result) {
    throw new Error(`discover_subhandles.py returned empty stdout for ${deploymentHandleSlug}@handlecontract`);
  }
  return result;
};

// Multi-contract orchestrator — preserves the exported API so callers in
// scripts/generateDeploymentPlan.ts don't need to change.
export const discoverNextContractSubhandles = async ({
  network,
  contracts,
  liveContracts = [],
  userAgent,
}: {
  network: "preview" | "preprod" | "mainnet";
  contracts: DesiredContractTarget[];
  liveContracts?: LiveContractState[];
  userAgent: string;
}): Promise<Record<string, string>> => {
  const entries = await Promise.all(
    contracts.map(async (contract) => {
      const liveContract = liveContracts.find((item) => item.contractSlug === contract.contractSlug);
      return [
        contract.contractSlug,
        await discoverOneSubhandle({
          network,
          deploymentHandleSlug: contract.deploymentHandleSlug,
          currentSubhandle: liveContract?.currentSubhandle ?? null,
          userAgent,
        }),
      ] as const;
    })
  );
  return Object.fromEntries(entries);
};

interface HandlePayload {
  utxo: string;
  hex: string;
  resolved_addresses?: {
    ada?: string;
  };
}

interface HandleUtxoPayload {
  lovelace?: number;
  datum?: string | null;
}

interface LiveSettingsState {
  currentSettingsUtxoRefs: Record<string, string>;
  values: DesiredDeploymentState["settings"]["values"] | null;
}

export const handlesApiBaseUrlForNetwork = (network: string): string => {
  if (network === "preview") return "https://preview.api.handle.me";
  if (network === "preprod") return "https://preprod.api.handle.me";
  return "https://api.handle.me";
};

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
    case "demimntprx.mint":
      return built.mintProxy.policyId;
    case "demimntmpt.spend":
      return built.mintingData.validatorHash;
    case "demimnt.withdraw":
      return built.mintV1.validatorHash;
    case "demiord.spend":
      return built.orders.validatorHash;
    default:
      throw new Error(`unsupported contract_name \`${contract.build.contractName}\``);
  }
};

// The handles api returns one of two shapes for `/scripts?latest=true&type=...`:
//   flat:         { validatorHash, handle, ... }
//   address-keyed: { "<scriptAddr>": { validatorHash, handle, latest, type, ... }, ... }
// Extract the deployed (script hash, subhandle), preferring the entry flagged latest.
const extractDeployedScript = (
  payload: unknown
): { scriptHash: string; subhandle: string | null } | null => {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const flatHash = String(obj.validatorHash ?? obj.scriptHash ?? "").trim();
  if (flatHash) {
    return { scriptHash: flatHash, subhandle: String(obj.handle ?? "").trim() || null };
  }
  const entries = Object.values(obj).filter(
    (v): v is Record<string, unknown> => !!v && typeof v === "object"
  );
  const candidates = entries.filter((e) => e.validatorHash || e.scriptHash);
  if (candidates.length === 0) return null;
  const chosen = candidates.find((e) => e.latest === true) ?? candidates[0];
  const scriptHash = String(chosen.validatorHash ?? chosen.scriptHash ?? "").trim();
  if (!scriptHash) return null;
  return { scriptHash, subhandle: String(chosen.handle ?? "").trim() || null };
};

export const fetchLiveContractStates = async ({
  network,
  contracts,
  userAgent,
  fetchFn = fetch,
}: {
  network: "preview" | "preprod" | "mainnet";
  contracts: DesiredContractTarget[];
  userAgent: string;
  fetchFn?: typeof fetch;
}): Promise<LiveContractState[]> => {
  const baseUrl = handlesApiBaseUrlForNetwork(network);
  return Promise.all(
    contracts.map(async (contract) => {
      // The api migrated from the legacy `demi_*` type slugs to the contract
      // slug (e.g. demimntmpt). Prefer the current slug; fall back to the
      // legacy slug only if the api hasn't migrated yet for this network.
      const typeCandidates = [contract.scriptType, contract.oldScriptType].filter(
        (t): t is string => !!t
      );
      let deployed: { scriptHash: string; subhandle: string | null } | null = null;
      for (const type of typeCandidates) {
        const response = await fetchFn(
          `${baseUrl}/scripts?latest=true&type=${encodeURIComponent(type)}`,
          { headers: { "User-Agent": userAgent } }
        );
        if (!response.ok) {
          throw new Error(`failed to load live ${contract.contractSlug} script: HTTP ${response.status}`);
        }
        deployed = extractDeployedScript(await response.json());
        if (deployed) break;
      }
      if (!deployed) {
        throw new Error(`live ${contract.contractSlug} script response missing validatorHash/scriptHash`);
      }
      return {
        contractSlug: contract.contractSlug,
        scriptType: contract.scriptType,
        currentScriptHash: deployed.scriptHash,
        currentSubhandle: deployed.subhandle,
      };
    })
  );
};

export const fetchLiveSettingsState = async ({
  network,
  userAgent,
  fetchFn = fetch,
}: {
  network: "preview" | "preprod" | "mainnet";
  userAgent: string;
  fetchFn?: typeof fetch;
}): Promise<LiveSettingsState> => {
  const [settingsHandle, mintingDataHandle, handlePriceHandle] = await Promise.all([
    fetchHandleJson({ network, handleName: DEMI_SETTINGS_HANDLE, userAgent, fetchFn }),
    fetchHandleJson({ network, handleName: MINTING_DATA_HANDLE, userAgent, fetchFn }),
    fetchHandleJson({ network, handleName: HANDLE_PRICE_HANDLE, userAgent, fetchFn }),
  ]);
  if (!settingsHandle || !mintingDataHandle || !handlePriceHandle) {
    return { currentSettingsUtxoRefs: {}, values: null };
  }

  const [mintingDataUtxo, handlePriceUtxo, settingsDatumHex, mintingDataDatumHex, handlePriceDatumHex] =
    await Promise.all([
      fetchHandleUtxo({ network, handleName: MINTING_DATA_HANDLE, userAgent, fetchFn }),
      fetchHandleUtxo({ network, handleName: HANDLE_PRICE_HANDLE, userAgent, fetchFn }),
      fetchHandleDatum({ network, handleName: DEMI_SETTINGS_HANDLE, userAgent, fetchFn }),
      fetchHandleDatum({ network, handleName: MINTING_DATA_HANDLE, userAgent, fetchFn }),
      fetchHandleDatum({ network, handleName: HANDLE_PRICE_HANDLE, userAgent, fetchFn }),
    ]);
  if (!mintingDataUtxo || !handlePriceUtxo || !settingsDatumHex || !mintingDataDatumHex || !handlePriceDatumHex) {
    return { currentSettingsUtxoRefs: {}, values: null };
  }

  const settings = decodeSettingsDatum(settingsDatumHex);
  const settingsV1 = decodeSettingsV1Data(settings.data, network);
  const mintingData = decodeMintingDataDatum(mintingDataDatumHex);
  const handlePrice = decodeHandlePriceInfoDatum(handlePriceDatumHex);

  return {
    currentSettingsUtxoRefs: {
      [DEMI_SETTINGS_HANDLE]: String(settingsHandle.utxo),
      [MINTING_DATA_HANDLE]: String(mintingDataHandle.utxo),
      [HANDLE_PRICE_HANDLE]: String(handlePriceHandle.utxo),
    },
    values: {
      [DEMI_SETTINGS_HANDLE]: {
        mint_governor: settings.mint_governor,
        mint_version: Number(settings.mint_version),
        policy_id: settingsV1.policy_id,
        allowed_minters: settingsV1.allowed_minters,
        valid_handle_price_assets: settingsV1.valid_handle_price_assets,
        treasury_address: settingsV1.treasury_address.toString(),
        treasury_fee_percentage: Number(settingsV1.treasury_fee_percentage),
        pz_script_address: settingsV1.pz_script_address.toString(),
        order_script_hash: settingsV1.order_script_hash,
        minting_data_script_hash: settingsV1.minting_data_script_hash,
      },
      [MINTING_DATA_HANDLE]: {
        mpt_root_hash: mintingData.mpt_root_hash,
      },
      [HANDLE_PRICE_HANDLE]: {
        current_data: handlePrice.current_data.map((item) => Number(item)),
        prev_data: handlePrice.prev_data.map((item) => Number(item)),
      },
    },
  };
};

export const buildDeploymentPlan = ({
  desired,
  expectedContracts,
  liveContracts,
  liveSettings,
  nextSubhandles = {},
}: {
  desired: DesiredDeploymentState;
  expectedContracts: ExpectedContractState[];
  liveContracts: LiveContractState[];
  liveSettings: LiveSettingsState;
  nextSubhandles?: Record<string, string>;
}) => {
  const filteredDesiredSettings = withoutIgnoredPaths(desired.settings.values, desired.ignoredSettings);
  const filteredLiveSettings = withoutIgnoredPaths(liveSettings.values ?? {}, desired.ignoredSettings);
  const settingsDiffRows = collectDiffRows(
    liveSettings.values,
    desired.settings.values,
    desired.ignoredSettings
  );

  const contractEntries = desired.contracts.map((contract) => {
    const expected = expectedContracts.find((item) => item.contractSlug === contract.contractSlug);
    const live = liveContracts.find((item) => item.contractSlug === contract.contractSlug);
    if (!expected || !live) {
      throw new Error(`missing expected/live contract state for ${contract.contractSlug}`);
    }
    const scriptHashChanged = live.currentScriptHash !== expected.expectedScriptHash;
    const settingsChanged = settingsDiffRows.length > 0;
    const driftType = classifyDrift(scriptHashChanged, settingsChanged);
    return {
      contract_slug: contract.contractSlug,
      script_type: contract.scriptType,
      drift_type: driftType,
      script_hashes: {
        current: live.currentScriptHash,
        expected: expected.expectedScriptHash,
      },
      settings: {
        type: desired.settings.type,
        diff_rows: settingsDiffRows,
        desired_values: filteredDesiredSettings,
        ignored_paths: desired.ignoredSettings,
      },
      subhandle: {
        action: scriptHashChanged ? "allocate" : "reuse",
        value: scriptHashChanged ? nextSubhandles[contract.contractSlug] ?? null : live.currentSubhandle,
      },
      expected_post_deploy_state: {
        repo: REPO_NAME,
        network: desired.network,
        contract_slug: contract.contractSlug,
        expected_script_hash: expected.expectedScriptHash,
        expected_subhandle: scriptHashChanged ? nextSubhandles[contract.contractSlug] ?? null : live.currentSubhandle,
        assigned_handles: {
          settings: desired.assignedHandles.settings,
          scripts: scriptHashChanged ? [nextSubhandles[contract.contractSlug]].filter(Boolean) : desired.assignedHandles.scripts,
        },
        settings: {
          type: desired.settings.type,
          values: filteredDesiredSettings,
          ignored_paths: desired.ignoredSettings,
        },
      },
    };
  });

  const planId = crypto.createHash("sha256").update(JSON.stringify({
    network: desired.network,
    build_parameters: desired.buildParameters,
    assigned_handles: desired.assignedHandles,
    ignored_settings: desired.ignoredSettings,
    desired_settings: filteredDesiredSettings,
    live_settings: filteredLiveSettings,
    contracts: contractEntries.map((entry) => ({
      contract_slug: entry.contract_slug,
      current: entry.script_hashes.current,
      expected: entry.script_hashes.expected,
      drift_type: entry.drift_type,
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
    "## Assigned Handles",
    ...desired.assignedHandles.settings.map((handleName) => `- Settings: \`${handleName}\``),
    ...desired.assignedHandles.scripts.map((handleName) => `- Script: \`${handleName}\``),
    "",
    "## Settings Drift",
    ...(settingsDiffRows.length > 0
      ? settingsDiffRows.map((row) => `- \`${row.path}\``)
      : ["- No settings changes."]),
    "",
    "## Contract Drift",
    ...contractEntries.flatMap((entry) => [
      `- \`${entry.contract_slug}\`: \`${entry.drift_type}\``,
      `  - Script Hash: \`${entry.script_hashes.current}\` -> \`${entry.script_hashes.expected}\``,
      `  - Handle: \`${entry.subhandle.value || ""}\``,
    ]),
    "",
    "## Transaction Order",
    ...renderTransactionOrderMarkdown([]),
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

export const buildUnsignedDeploymentTxArtifact = async ({
  desired,
  contract,
  handleName,
  deployer,
  nativeScriptCborHex,
  blockfrostApiKey,
  userAgent,
  excludeUtxoRefs,
  buildTxFn = buildReferenceScriptDeploymentTx,
  maxTxSize: maxTxSizeOverride,
}: {
  desired: DesiredDeploymentState;
  contract: DesiredContractTarget;
  handleName: string;
  deployer: DeployerWallet;
  nativeScriptCborHex?: string;
  blockfrostApiKey?: string;
  userAgent?: string;
  excludeUtxoRefs?: Set<string>;
  buildTxFn?: typeof buildReferenceScriptDeploymentTx;
  maxTxSize?: number;
}): Promise<UnsignedDeploymentTxArtifact> => {
  const { cborHex, estimatedSignedTxSize, consumedInputs } = await buildTxFn({
    desired,
    contract,
    handleName,
    changeAddress: deployer.address,
    spareUtxos: [...deployer.utxos],
    nativeScriptCborHex,
    blockfrostApiKey,
    userAgent,
    excludeUtxoRefs,
  });

  // maxTxSize comes from protocol parameters; the tx builder already fetches them,
  // so accept an override or default to the Conway-era maximum.
  const maxTxSize = maxTxSizeOverride ?? 16384;
  if (estimatedSignedTxSize > maxTxSize) {
    throw new Error(
      `unsigned deployment tx for ${handleName} is too large after adding 1 required signature: ${estimatedSignedTxSize} > ${maxTxSize}`
    );
  }

  const cborBytes = Buffer.from(cborHex, "hex");
  return {
    cborBytes,
    cborHex,
    estimatedSignedTxSize,
    maxTxSize,
    consumedInputs,
  };
};

export const buildUnsignedSettingsUpdateTxArtifact = async ({
  desired,
  settingsHandleName,
  deployer,
  nativeScriptCborHex,
  blockfrostApiKey,
  userAgent,
  excludeUtxoRefs,
  buildTxFn = buildSettingsUpdateTx,
  maxTxSize: maxTxSizeOverride,
}: {
  desired: DesiredDeploymentState;
  settingsHandleName: string;
  deployer: DeployerWallet;
  nativeScriptCborHex?: string;
  blockfrostApiKey?: string;
  userAgent?: string;
  excludeUtxoRefs?: Set<string>;
  buildTxFn?: typeof buildSettingsUpdateTx;
  maxTxSize?: number;
}): Promise<UnsignedDeploymentTxArtifact> => {
  const { cborHex, estimatedSignedTxSize, consumedInputs } = await buildTxFn({
    desired,
    settingsHandleName,
    changeAddress: deployer.address,
    spareUtxos: [...deployer.utxos],
    nativeScriptCborHex,
    blockfrostApiKey,
    userAgent,
    excludeUtxoRefs,
  });

  const maxTxSize = maxTxSizeOverride ?? 16384;
  if (estimatedSignedTxSize > maxTxSize) {
    throw new Error(
      `unsigned settings update tx is too large after adding 1 required signature: ${estimatedSignedTxSize} > ${maxTxSize}`
    );
  }

  const cborBytes = Buffer.from(cborHex, "hex");
  return {
    cborBytes,
    cborHex,
    estimatedSignedTxSize,
    maxTxSize,
    consumedInputs,
  };
};

const classifyDrift = (scriptHashChanged: boolean, settingsChanged: boolean) => {
  if (scriptHashChanged && settingsChanged) return "script_hash_and_settings";
  if (scriptHashChanged) return "script_hash_only";
  if (settingsChanged) return "settings_only";
  return "no_change";
};

const collectDiffRows = (
  current: DesiredDeploymentState["settings"]["values"] | null,
  expected: DesiredDeploymentState["settings"]["values"],
  ignoredPaths: string[],
  prefix = ""
): Array<{ path: string; current: unknown; desired: unknown }> => {
  const filteredCurrent = withoutIgnoredPaths(current, ignoredPaths);
  const filteredExpected = withoutIgnoredPaths(expected, ignoredPaths);
  if (!filteredCurrent) {
    return [{ path: prefix || "settings", current: null, desired: filteredExpected }];
  }
  const rows: Array<{ path: string; current: unknown; desired: unknown }> = [];
  walkDiff(rows, filteredCurrent, filteredExpected, prefix);
  return rows;
};

const walkDiff = (
  rows: Array<{ path: string; current: unknown; desired: unknown }>,
  current: unknown,
  expected: unknown,
  prefix: string
) => {
  if (Array.isArray(expected)) {
    if (JSON.stringify(current) !== JSON.stringify(expected)) {
      rows.push({ path: prefix, current, desired: expected });
    }
    return;
  }
  if (expected && typeof expected === "object") {
    const currentRecord = current && typeof current === "object" && !Array.isArray(current)
      ? current as Record<string, unknown>
      : {};
    for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
      walkDiff(rows, currentRecord[key], value, prefix ? `${prefix}.${key}` : key);
    }
    return;
  }
  if (current !== expected) {
    rows.push({ path: prefix, current, desired: expected });
  }
};

const withoutIgnoredPaths = (value: unknown, ignoredPaths: string[]) =>
  ignoredPaths.reduce((current, path) => withoutIgnoredPath(current, path), value);

const withoutIgnoredPath = (value: unknown, path: string): unknown => {
  let normalized = String(path || "").trim();
  if (!normalized) return value;
  if (normalized.startsWith("settings.values.")) {
    normalized = normalized.slice("settings.values.".length);
  }
  const parts = normalized.split(".").filter(Boolean);
  if (parts.length === 0) return value;
  return withoutIgnoredPathParts(value, parts);
};

const withoutIgnoredPathParts = (value: unknown, parts: string[]): unknown => {
  if (parts.length === 0) return value;
  const [head, ...tail] = parts;
  if (Array.isArray(value)) {
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0 || index >= value.length) {
      return value;
    }
    const updated = [...value];
    if (tail.length === 0) {
      updated.splice(index, 1);
      return updated;
    }
    updated[index] = withoutIgnoredPathParts(updated[index], tail);
    return updated;
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = { ...(value as Record<string, unknown>) };
  if (!(head in record)) {
    return value;
  }
  if (tail.length === 0) {
    delete record[head];
    return record;
  }
  record[head] = withoutIgnoredPathParts(record[head], tail);
  return record;
};

const fetchHandleJson = async ({
  network,
  handleName,
  userAgent,
  fetchFn,
}: {
  network: string;
  handleName: string;
  userAgent: string;
  fetchFn: typeof fetch;
}) => {
  const response = await fetchFn(
    `${handlesApiBaseUrlForNetwork(network)}/handles/${encodeURIComponent(handleName)}`,
    { headers: { "User-Agent": userAgent } }
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`failed to load handle ${handleName}: HTTP ${response.status}`);
  }
  return await response.json() as HandlePayload;
};

const fetchHandleUtxo = async ({
  network,
  handleName,
  userAgent,
  fetchFn,
}: {
  network: string;
  handleName: string;
  userAgent: string;
  fetchFn: typeof fetch;
}) => {
  const response = await fetchFn(
    `${handlesApiBaseUrlForNetwork(network)}/handles/${encodeURIComponent(handleName)}/utxo`,
    { headers: { "User-Agent": userAgent } }
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`failed to load handle UTxO ${handleName}: HTTP ${response.status}`);
  }
  return await response.json() as HandleUtxoPayload;
};

const fetchHandleDatum = async ({
  network,
  handleName,
  userAgent,
  fetchFn,
}: {
  network: string;
  handleName: string;
  userAgent: string;
  fetchFn: typeof fetch;
}) => {
  const response = await fetchFn(
    `${handlesApiBaseUrlForNetwork(network)}/handles/${encodeURIComponent(handleName)}/datum`,
    { headers: { "User-Agent": userAgent, Accept: "text/plain" } }
  );
  if (response.status === 404) return null;
  // api.handle.me returns HTTP 202 for settings-handle datums even when the
  // body is fully-formed valid CBOR — treating 202 as null makes every live
  // value appear missing, which in turn makes the drift detector report a
  // wholesale "settings drifted" against desired and re-emit already-applied
  // settings updates. Accept 202 alongside 200.
  if (!response.ok) {
    throw new Error(`failed to load handle datum ${handleName}: HTTP ${response.status}`);
  }
  return (await response.text()).trim() || null;
};
