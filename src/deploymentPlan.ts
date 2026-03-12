import crypto from "node:crypto";
import { Buffer } from "node:buffer";

import {
  makeAddress,
  makeAssetClass,
  makeAssets,
  makeInlineTxOutputDatum,
  makeTxInput,
  makeTxOutput,
  makeValue,
} from "@helios-lang/ledger";
import { decodeUplcData } from "@helios-lang/uplc";

import { LEGACY_POLICY_ID } from "./constants/index.js";
import { buildReferenceScriptDeploymentTx } from "./deploymentTx.js";
import { buildContracts } from "./contracts/config.js";
import {
  decodeHandlePriceInfoDatum,
  decodeMintingDataDatum,
  decodeSettingsDatum,
  decodeSettingsV1Data,
} from "./contracts/index.js";
import type { DesiredContractTarget, DesiredDeploymentState } from "./deploymentState.js";
import { fetchNetworkParameters } from "./utils/index.js";

const REPO_NAME = "decentralized-minting";
const DEMI_SETTINGS_HANDLE = "demi@handle_settings";
const MINTING_DATA_HANDLE = "handle_root@handle_settings";
const HANDLE_PRICE_HANDLE = "kora@handle_prices";

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
}

export const renderTransactionOrderMarkdown = (transactionOrder: string[]) =>
  transactionOrder.length > 0
    ? transactionOrder.map((fileName) => `- \`${fileName}\``)
    : ["- Planner can emit `tx-XX.cbor` artifacts when `--change-address` and `--cbor-utxos-json` are supplied."];

export const discoverNextContractSubhandles = async ({
  network,
  contracts,
  liveContracts = [],
  userAgent,
  fetchFn = fetch,
}: {
  network: "preview" | "preprod" | "mainnet";
  contracts: DesiredContractTarget[];
  liveContracts?: LiveContractState[];
  userAgent: string;
  fetchFn?: typeof fetch;
}): Promise<Record<string, string>> => {
  const entries = await Promise.all(
    contracts.map(async (contract) => {
      const liveContract = liveContracts.find((item) => item.contractSlug === contract.contractSlug);
      return [
        contract.contractSlug,
        await discoverNextContractSubhandle({
          network,
          deploymentHandleSlug: contract.deploymentHandleSlug,
          currentSubhandle: liveContract?.currentSubhandle ?? null,
          userAgent,
          fetchFn,
        }),
      ] as const;
    })
  );
  return Object.fromEntries(entries);
};

const discoverNextContractSubhandle = async ({
  network,
  deploymentHandleSlug,
  currentSubhandle,
  userAgent,
  fetchFn = fetch,
}: {
  network: "preview" | "preprod" | "mainnet";
  deploymentHandleSlug: string;
  currentSubhandle?: string | null;
  userAgent: string;
  fetchFn?: typeof fetch;
}): Promise<string> => {
  const baseUrl = handlesApiBaseUrlForNetwork(network);
  const suffix = "@handlecontract";
  const currentOrdinal =
    currentSubhandle &&
    currentSubhandle.startsWith(deploymentHandleSlug) &&
    currentSubhandle.endsWith(suffix) &&
    /^[0-9]+$/.test(currentSubhandle.slice(deploymentHandleSlug.length, currentSubhandle.length - suffix.length))
      ? Number.parseInt(currentSubhandle.slice(deploymentHandleSlug.length, currentSubhandle.length - suffix.length), 10)
      : 0;
  const existingOrdinals: number[] = [];

  for (let ordinal = 1; ordinal < 10000; ordinal += 1) {
    const candidate = `${deploymentHandleSlug}${ordinal}${suffix}`;
    const response = await fetchFn(
      `${baseUrl}/handles/${encodeURIComponent(candidate)}`,
      { headers: { "User-Agent": userAgent } }
    );
    if (response.status === 404) {
      const existingReplacement = existingOrdinals.find((existingOrdinal) => existingOrdinal > currentOrdinal);
      return existingReplacement
        ? `${deploymentHandleSlug}${existingReplacement}${suffix}`
        : candidate;
    }
    if (!response.ok) {
      throw new Error(`failed to probe SubHandle ${candidate}: HTTP ${response.status}`);
    }
    existingOrdinals.push(ordinal);
  }

  throw new Error(`no available SubHandle found for ${deploymentHandleSlug}${suffix}`);
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

const handlesApiBaseUrlForNetwork = (network: string): string => {
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
      return built.mintProxy.mintProxyPolicyHash.toHex();
    case "demimntmpt.spend":
      return built.mintingData.mintingDataValidatorHash.toHex();
    case "demimnt.withdraw":
      return built.mintV1.mintV1ValidatorHash.toHex();
    case "demiord.spend":
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
  network: "preview" | "preprod" | "mainnet";
  contracts: DesiredContractTarget[];
  userAgent: string;
  fetchFn?: typeof fetch;
}): Promise<LiveContractState[]> => {
  const baseUrl = handlesApiBaseUrlForNetwork(network);
  return Promise.all(
    contracts.map(async (contract) => {
      const response = await fetchFn(
        `${baseUrl}/scripts?latest=true&type=${encodeURIComponent(contract.oldScriptType ?? contract.scriptType)}`,
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

  const settingsTxInput = makeTxInput(
    String(settingsHandle.utxo),
    makeTxOutput(
      makeAddress(String(settingsHandle.resolved_addresses?.ada)),
      makeValue(1n, makeAssets([[makeAssetClass(`${LEGACY_POLICY_ID}.${String(settingsHandle.hex)}`), 1n]])),
      makeInlineTxOutputDatum(decodeUplcData(settingsDatumHex))
    )
  );
  const mintingDataTxInput = makeTxInput(
    String(mintingDataHandle.utxo),
    makeTxOutput(
      makeAddress(String(mintingDataHandle.resolved_addresses?.ada)),
      makeValue(
        BigInt(Number(mintingDataUtxo.lovelace ?? 0)),
        makeAssets([[makeAssetClass(`${LEGACY_POLICY_ID}.${String(mintingDataHandle.hex)}`), 1n]])
      ),
      makeInlineTxOutputDatum(decodeUplcData(mintingDataDatumHex))
    )
  );
  const handlePriceTxInput = makeTxInput(
    String(handlePriceHandle.utxo),
    makeTxOutput(
      makeAddress(String(handlePriceHandle.resolved_addresses?.ada)),
      makeValue(
        BigInt(Number(handlePriceUtxo.lovelace ?? 0)),
        makeAssets([[makeAssetClass(`${LEGACY_POLICY_ID}.${String(handlePriceHandle.hex)}`), 1n]])
      ),
      makeInlineTxOutputDatum(decodeUplcData(handlePriceDatumHex))
    )
  );

  const settings = decodeSettingsDatum(settingsTxInput.datum);
  const settingsV1 = decodeSettingsV1Data(settings.data, network);
  const mintingData = decodeMintingDataDatum(mintingDataTxInput.datum);
  const handlePrice = decodeHandlePriceInfoDatum(handlePriceTxInput.datum);

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
  changeAddress,
  cborUtxos,
  buildTxFn = buildReferenceScriptDeploymentTx,
  fetchNetworkParametersFn = fetchNetworkParameters,
}: {
  desired: DesiredDeploymentState;
  contract: DesiredContractTarget;
  handleName: string;
  changeAddress: string;
  cborUtxos: string[];
  buildTxFn?: typeof buildReferenceScriptDeploymentTx;
  fetchNetworkParametersFn?: typeof fetchNetworkParameters;
}): Promise<UnsignedDeploymentTxArtifact> => {
  const tx = await buildTxFn({
    desired,
    contract,
    handleName,
    changeAddress,
    cborUtxos,
  });
  tx.witnesses.addDummySignatures(1);
  const estimatedSignedTxSize = tx.calcSize();
  tx.witnesses.removeDummySignatures(1);

  const networkParametersResult = await fetchNetworkParametersFn(desired.network);
  if (!networkParametersResult.ok) {
    throw new Error("Failed to fetch network parameter");
  }
  const maxTxSize = networkParametersResult.data.maxTxSize;
  if (estimatedSignedTxSize > maxTxSize) {
    throw new Error(
      `unsigned deployment tx for ${handleName} is too large after adding 1 required signature: ${estimatedSignedTxSize} > ${maxTxSize}`
    );
  }

  const cborBytes = Buffer.from(tx.toCbor());
  return {
    cborBytes,
    cborHex: cborBytes.toString("hex"),
    estimatedSignedTxSize,
    maxTxSize,
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
    { headers: { "User-Agent": userAgent } }
  );
  if (response.status === 404 || response.status === 202) return null;
  if (!response.ok) {
    throw new Error(`failed to load handle datum ${handleName}: HTTP ${response.status}`);
  }
  return (await response.text()).trim() || null;
};
