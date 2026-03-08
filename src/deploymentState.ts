import fs from "node:fs/promises";

import YAML from "yaml";

const ALLOWED_NETWORKS = new Set(["preview", "preprod"]);
const ALLOWED_BUILD_KINDS = new Set(["validator", "minting_policy"]);
const ALLOWED_SCRIPT_TYPES = new Set([
  "demi_mint_proxy",
  "demi_minting_data",
  "demi_mint",
  "demi_orders",
]);
const ALLOWED_CONTRACT_SLUGS = new Set([
  "demi-mint-proxy",
  "demi-minting-data",
  "demi-mint",
  "demi-orders",
]);
const OBSERVED_ONLY_FIELDS = new Set([
  "current_script_hash",
  "current_settings_utxo_ref",
  "current_subhandle",
  "observed_at",
  "last_deployed_tx_hash",
]);

export interface DesiredContractTarget {
  contractSlug: string;
  scriptType: string;
  build: {
    contractName: string;
    kind: string;
  };
}

export interface DesiredDeploymentState {
  schemaVersion: 1;
  network: "preview" | "preprod";
  buildParameters: {
    mintVersion: number;
    legacyPolicyId: string;
    adminVerificationKeyHash: string;
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

  const network = requireString(value, "network", sourceLabel).toLowerCase();
  if (!ALLOWED_NETWORKS.has(network)) {
    throw new Error(`${sourceLabel} network must be one of preview, preprod`);
  }

  const buildParameters = requireObject(value, "build_parameters", sourceLabel);
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
    schemaVersion: 1,
    network: network as "preview" | "preprod",
    buildParameters: {
      mintVersion: requireNumber(buildParameters, "mint_version", `${sourceLabel}.build_parameters`),
      legacyPolicyId: requireString(buildParameters, "legacy_policy_id", `${sourceLabel}.build_parameters`),
      adminVerificationKeyHash: requireString(buildParameters, "admin_verification_key_hash", `${sourceLabel}.build_parameters`),
    },
    contracts,
  };
};

const parseContractTarget = (value: unknown, sourceLabel: string): DesiredContractTarget => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${sourceLabel} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const contractSlug = requireString(record, "contract_slug", sourceLabel);
  if (!ALLOWED_CONTRACT_SLUGS.has(contractSlug)) {
    throw new Error(`${sourceLabel}.contract_slug is not supported`);
  }
  const scriptType = requireString(record, "script_type", sourceLabel);
  if (!ALLOWED_SCRIPT_TYPES.has(scriptType)) {
    throw new Error(`${sourceLabel}.script_type is not supported`);
  }
  const build = requireObject(record, "build", sourceLabel);
  const buildKind = requireString(build, "kind", `${sourceLabel}.build`);
  if (!ALLOWED_BUILD_KINDS.has(buildKind)) {
    throw new Error(`${sourceLabel}.build.kind must be validator or minting_policy`);
  }
  return {
    contractSlug,
    scriptType,
    build: {
      contractName: requireString(build, "contract_name", `${sourceLabel}.build`),
      kind: buildKind,
    },
  };
};

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
