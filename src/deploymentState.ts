import fs from "node:fs/promises";

import YAML from "yaml";

const ALLOWED_NETWORKS = new Set(["preview", "preprod", "mainnet"]);
const ALLOWED_BUILD_KINDS = new Set(["validator", "minting_policy"]);
const ALLOWED_SCRIPT_TYPES = new Set([
  "demimntprx",
  "demimntmpt",
  "demimnt",
  "demiord",
]);
const ALLOWED_CONTRACT_SLUGS = new Set([
  "demimntprx",
  "demimntmpt",
  "demimnt",
  "demiord",
]);
const OBSERVED_ONLY_FIELDS = new Set([
  "current_script_hash",
  "current_settings_utxo_ref",
  "current_subhandle",
  "observed_at",
  "last_deployed_tx_hash",
]);

const DEMI_SETTINGS_HANDLE = "demi@handle_settings";
const MINTING_DATA_HANDLE = "demi_root@handle_settings";
const HANDLE_PRICE_HANDLE = "kora@handle_prices";

export interface DesiredContractTarget {
  contractSlug: string;
  scriptType: string;
  oldScriptType: string | null;
  deploymentHandleSlug: string;
  build: {
    contractName: string;
    kind: string;
  };
}

export interface DesiredDeploymentState {
  schemaVersion: 2;
  network: "preview" | "preprod" | "mainnet";
  buildParameters: {
    mintVersion: number;
    legacyPolicyId: string;
    adminVerificationKeyHash: string;
  };
  assignedHandles: {
    settings: string[];
    scripts: string[];
  };
  ignoredSettings: string[];
  settings: {
    type: "decentralized_minting_settings";
    values: {
      "demi@handle_settings": {
        mint_governor: string;
        mint_version: number;
        policy_id: string;
        allowed_minters: string[];
        valid_handle_price_assets: string[];
        treasury_address: string;
        treasury_fee_percentage: number;
        pz_script_address: string;
        order_script_hash: string;
        minting_data_script_hash: string;
      };
      "demi_root@handle_settings": {
        mpt_root_hash: string;
      };
      "kora@handle_prices": {
        current_data: number[];
        prev_data: number[];
      };
    };
  };
  contracts: DesiredContractTarget[];
}

export const loadDesiredDeploymentState = async (
  path: string
): Promise<DesiredDeploymentState> => {
  const raw = await fs.readFile(path, "utf8");
  return parseDesiredDeploymentState(raw, path);
};

export const parseDesiredDeploymentState = (
  raw: string,
  sourceLabel = "desired deployment state"
): DesiredDeploymentState => {
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (error) {
    throw new Error(
      `${sourceLabel} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${sourceLabel} must be a YAML object`);
  }

  const value = parsed as Record<string, unknown>;
  const observedOnlyField = Object.keys(value).find((key) => OBSERVED_ONLY_FIELDS.has(key));
  if (observedOnlyField) {
    throw new Error(`${sourceLabel} must not include observed-only field \`${observedOnlyField}\``);
  }

  const schemaVersion = requireNumber(value, "schema_version", sourceLabel);
  if (schemaVersion !== 2) {
    throw new Error(`${sourceLabel} schema_version must equal 2`);
  }

  const network = requireString(value, "network", sourceLabel).toLowerCase();
  if (!ALLOWED_NETWORKS.has(network)) {
    throw new Error(`${sourceLabel} network must be one of preview, preprod, mainnet`);
  }

  const buildParameters = requireObject(value, "build_parameters", sourceLabel);
  const assignedHandles = requireObject(value, "assigned_handles", sourceLabel);
  const settings = requireObject(value, "settings", sourceLabel);
  const settingsType = requireString(settings, "type", `${sourceLabel}.settings`);
  if (settingsType !== "decentralized_minting_settings") {
    throw new Error(`${sourceLabel}.settings.type must be decentralized_minting_settings`);
  }
  const contracts = requireArray(value, "contracts", sourceLabel).map((entry, index) =>
    parseContractTarget(entry, `${sourceLabel}.contracts[${index}]`)
  );

  const duplicates = new Set<string>();
  for (const contract of contracts) {
    if (duplicates.has(contract.contractSlug)) {
      throw new Error(`${sourceLabel}.contracts must not repeat contract_slug \`${contract.contractSlug}\``);
    }
    duplicates.add(contract.contractSlug);
  }

  return {
    schemaVersion: 2,
    network: network as "preview" | "preprod" | "mainnet",
    buildParameters: {
      mintVersion: requireNumber(buildParameters, "mint_version", `${sourceLabel}.build_parameters`),
      legacyPolicyId: requireString(buildParameters, "legacy_policy_id", `${sourceLabel}.build_parameters`),
      adminVerificationKeyHash: requireString(buildParameters, "admin_verification_key_hash", `${sourceLabel}.build_parameters`),
    },
    assignedHandles: {
      settings: requireStringArrayAllowEmpty(assignedHandles, "settings", `${sourceLabel}.assigned_handles`),
      scripts: requireStringArrayAllowEmpty(assignedHandles, "scripts", `${sourceLabel}.assigned_handles`),
    },
    ignoredSettings: requireStringArrayAllowEmpty(value, "ignored_settings", sourceLabel),
    settings: {
      type: "decentralized_minting_settings",
      values: parseSettingsValues(
        requireObject(settings, "values", `${sourceLabel}.settings`),
        `${sourceLabel}.settings.values`
      ),
    },
    contracts,
  };
};

const parseContractTarget = (value: unknown, sourceLabel: string): DesiredContractTarget => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${sourceLabel} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const contractSlug = requireShortHandleSlug(record, "contract_slug", sourceLabel);
  if (!ALLOWED_CONTRACT_SLUGS.has(contractSlug)) {
    throw new Error(`${sourceLabel}.contract_slug is not supported`);
  }
  const scriptType = requireShortHandleSlug(record, "script_type", sourceLabel);
  if (!ALLOWED_SCRIPT_TYPES.has(scriptType)) {
    throw new Error(`${sourceLabel}.script_type is not supported`);
  }
  const deploymentHandleSlug = requireShortHandleSlug(record, "deployment_handle_slug", sourceLabel);
  if (contractSlug !== scriptType || scriptType !== deploymentHandleSlug) {
    throw new Error(
      `${sourceLabel} contract_slug, script_type, and deployment_handle_slug must match`
    );
  }
  const build = requireObject(record, "build", sourceLabel);
  const buildKind = requireString(build, "kind", `${sourceLabel}.build`);
  if (!ALLOWED_BUILD_KINDS.has(buildKind)) {
    throw new Error(`${sourceLabel}.build.kind must be validator or minting_policy`);
  }
  return {
    contractSlug,
    scriptType,
    oldScriptType: requireOptionalString(record, "old_script_type", sourceLabel),
    deploymentHandleSlug,
    build: {
      contractName: requireString(build, "contract_name", `${sourceLabel}.build`),
      kind: buildKind,
    },
  };
};

const parseSettingsValues = (value: Record<string, unknown>, sourceLabel: string) => ({
  [DEMI_SETTINGS_HANDLE]: parseDemiSettings(
    requireObject(value, DEMI_SETTINGS_HANDLE, sourceLabel),
    `${sourceLabel}.${DEMI_SETTINGS_HANDLE}`
  ),
  [MINTING_DATA_HANDLE]: parseMintingDataSettings(
    requireObject(value, MINTING_DATA_HANDLE, sourceLabel),
    `${sourceLabel}.${MINTING_DATA_HANDLE}`
  ),
  [HANDLE_PRICE_HANDLE]: parseHandlePriceSettings(
    requireObject(value, HANDLE_PRICE_HANDLE, sourceLabel),
    `${sourceLabel}.${HANDLE_PRICE_HANDLE}`
  ),
});

const parseDemiSettings = (value: Record<string, unknown>, sourceLabel: string) => ({
  mint_governor: requireString(value, "mint_governor", sourceLabel),
  mint_version: requireNumber(value, "mint_version", sourceLabel),
  policy_id: requireString(value, "policy_id", sourceLabel),
  allowed_minters: requireStringArrayAllowEmpty(value, "allowed_minters", sourceLabel),
  valid_handle_price_assets: requireStringArrayAllowEmpty(value, "valid_handle_price_assets", sourceLabel),
  treasury_address: requireString(value, "treasury_address", sourceLabel),
  treasury_fee_percentage: requireNumber(value, "treasury_fee_percentage", sourceLabel),
  pz_script_address: requireString(value, "pz_script_address", sourceLabel),
  order_script_hash: requireString(value, "order_script_hash", sourceLabel),
  minting_data_script_hash: requireString(value, "minting_data_script_hash", sourceLabel),
});

const parseMintingDataSettings = (value: Record<string, unknown>, sourceLabel: string) => ({
  mpt_root_hash: requireString(value, "mpt_root_hash", sourceLabel),
});

const parseHandlePriceSettings = (value: Record<string, unknown>, sourceLabel: string) => ({
  current_data: requireNumberArray(value, "current_data", sourceLabel),
  prev_data: requireNumberArray(value, "prev_data", sourceLabel),
});

const requireArray = (value: Record<string, unknown>, key: string, sourceLabel: string): unknown[] => {
  const resolved = value[key];
  if (!Array.isArray(resolved) || resolved.length === 0) {
    throw new Error(`${sourceLabel} must include non-empty array field \`${key}\``);
  }
  return resolved;
};

const requireObject = (value: Record<string, unknown>, key: string, sourceLabel: string): Record<string, unknown> => {
  const resolved = value[key];
  if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
    throw new Error(`${sourceLabel} must include object field \`${key}\``);
  }
  return resolved as Record<string, unknown>;
};

const requireString = (value: Record<string, unknown>, key: string, sourceLabel: string): string => {
  const resolved = value[key];
  if (typeof resolved !== "string" || resolved.trim() === "") {
    throw new Error(`${sourceLabel} must include string field \`${key}\``);
  }
  return resolved.trim();
};

const requireNumber = (value: Record<string, unknown>, key: string, sourceLabel: string): number => {
  const resolved = value[key];
  if (typeof resolved !== "number" || Number.isNaN(resolved)) {
    throw new Error(`${sourceLabel} must include numeric field \`${key}\``);
  }
  return resolved;
};

const requireStringArrayAllowEmpty = (
  value: Record<string, unknown>,
  key: string,
  sourceLabel: string
): string[] => {
  const resolved = value[key];
  if (!Array.isArray(resolved)) {
    throw new Error(`${sourceLabel} must include array field \`${key}\``);
  }
  return resolved.map((item) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new Error(`${sourceLabel} must include string array field \`${key}\``);
    }
    return item.trim();
  });
};

const requireNumberArray = (
  value: Record<string, unknown>,
  key: string,
  sourceLabel: string
): number[] => {
  const resolved = value[key];
  if (!Array.isArray(resolved)) {
    throw new Error(`${sourceLabel} must include array field \`${key}\``);
  }
  return resolved.map((item) => {
    if (typeof item !== "number" || Number.isNaN(item)) {
      throw new Error(`${sourceLabel} must include numeric array field \`${key}\``);
    }
    return item;
  });
};

const requireShortHandleSlug = (
  value: Record<string, unknown>,
  key: string,
  sourceLabel: string
): string => {
  const resolved = requireString(value, key, sourceLabel);
  if (resolved.length > 10) {
    throw new Error(`${sourceLabel}.${key} must be 10 characters or fewer`);
  }
  if (resolved.includes("-") || resolved.includes("_")) {
    throw new Error(`${sourceLabel}.${key} must not contain '-' or '_'`);
  }
  return resolved;
};

const requireOptionalString = (
  value: Record<string, unknown>,
  key: string,
  sourceLabel: string
): string | null => {
  const resolved = value[key];
  if (resolved === undefined || resolved === null) {
    return null;
  }
  if (typeof resolved !== "string" || resolved.trim() === "") {
    throw new Error(`${sourceLabel} must include string field \`${key}\``);
  }
  return resolved.trim();
};
