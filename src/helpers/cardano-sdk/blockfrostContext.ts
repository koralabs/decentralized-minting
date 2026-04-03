import type { Cardano as CardanoTypes } from "@cardano-sdk/core";

import { Cardano } from "./index.js";

type BlockfrostNetwork = "mainnet" | "preprod" | "preview";

interface BlockfrostLatestBlockResponse {
  hash: string;
  epoch: number;
  epoch_slot: number;
  height: number;
  slot: number;
  time: number;
}

interface BlockfrostGenesisResponse {
  active_slots_coefficient: number | string;
  epoch_length: number | string;
  max_kes_evolutions: number | string;
  max_lovelace_supply: number | string;
  network_magic: number | string;
  security_param: number | string;
  slot_length: number | string;
  slots_per_kes_period: number | string;
  system_start: number | string;
  update_quorum: number | string;
}

interface BlockfrostEpochParametersResponse {
  a0: number | string;
  coins_per_utxo_size?: number | string;
  coins_per_utxo_word?: number | string;
  collateral_percent: number | string;
  cost_models_raw?: Partial<Record<"PlutusV1" | "PlutusV2" | "PlutusV3", number[]>>;
  e_max: number | string;
  key_deposit: number | string;
  max_block_ex_mem: number | string;
  max_block_ex_steps: number | string;
  max_block_header_size: number | string;
  max_block_size: number | string;
  max_collateral_inputs: number | string;
  pool_deposit: number | string;
  max_tx_ex_mem: number | string;
  max_tx_ex_steps: number | string;
  max_tx_size: number | string;
  max_val_size: number | string;
  min_fee_a: number | string;
  min_fee_b: number | string;
  min_fee_ref_script_cost_per_byte?: number | string | null;
  min_pool_cost: number | string;
  min_utxo?: number | string;
  n_opt: number | string;
  price_mem: number | string;
  price_step: number | string;
  protocol_major_ver: number | string;
  protocol_minor_ver: number | string;
  rho: number | string;
  tau: number | string;
}

export interface BlockfrostBuildContext {
  protocolParameters: CardanoTypes.ProtocolParameters;
  validityInterval: CardanoTypes.ValidityInterval;
}

export interface BlockfrostBuildContextDependencies {
  fetchFn?: typeof fetch;
}

const toNumber = (value: number | string, label: string): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  throw new Error(`Invalid Blockfrost ${label}: expected a finite number`);
};

const getBlockfrostHost = (network: BlockfrostNetwork): string =>
  `https://cardano-${network}.blockfrost.io/api/v0`;

const fetchBlockfrostJson = async <T>(
  path: string,
  apiKey: string,
  network: BlockfrostNetwork,
  fetchFn: typeof fetch,
): Promise<T> => {
  const url = `${getBlockfrostHost(network)}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetchFn(url, {
    headers: { "Content-Type": "application/json", project_id: apiKey },
  });
  if (!response.ok) {
    throw new Error(`Blockfrost ${path}: HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
};

const mapCostModels = (value: BlockfrostEpochParametersResponse["cost_models_raw"]): CardanoTypes.CostModels => {
  const costModels = new Map<CardanoTypes.PlutusLanguageVersion, CardanoTypes.CostModel>();
  if (!value) return costModels;
  const versionByName: Record<string, CardanoTypes.PlutusLanguageVersion> = {
    PlutusV1: Cardano.PlutusLanguageVersion.V1,
    PlutusV2: Cardano.PlutusLanguageVersion.V2,
    PlutusV3: Cardano.PlutusLanguageVersion.V3,
  };
  for (const [name, model] of Object.entries(value)) {
    const version = versionByName[name];
    if (version === undefined || !Array.isArray(model)) continue;
    costModels.set(version, model.map((cost, index) => toNumber(cost, `cost model ${name}[${index}]`)));
  }
  return costModels;
};

const mapBlockfrostProtocolParameters = (response: BlockfrostEpochParametersResponse): CardanoTypes.ProtocolParameters => ({
  coinsPerUtxoByte: toNumber(
    response.coins_per_utxo_size ?? response.coins_per_utxo_word ?? response.min_utxo ?? 0,
    "epoch_parameters.coins_per_utxo_size",
  ),
  maxTxSize: toNumber(response.max_tx_size, "epoch_parameters.max_tx_size"),
  maxBlockBodySize: toNumber(response.max_block_size, "epoch_parameters.max_block_size"),
  maxBlockHeaderSize: toNumber(response.max_block_header_size, "epoch_parameters.max_block_header_size"),
  stakeKeyDeposit: toNumber(response.key_deposit, "epoch_parameters.key_deposit"),
  poolDeposit: toNumber(response.pool_deposit, "epoch_parameters.pool_deposit"),
  poolRetirementEpochBound: toNumber(response.e_max, "epoch_parameters.e_max"),
  desiredNumberOfPools: toNumber(response.n_opt, "epoch_parameters.n_opt"),
  poolInfluence: String(response.a0),
  monetaryExpansion: String(response.rho),
  treasuryExpansion: String(response.tau),
  minPoolCost: toNumber(response.min_pool_cost, "epoch_parameters.min_pool_cost"),
  protocolVersion: {
    major: toNumber(response.protocol_major_ver, "epoch_parameters.protocol_major_ver"),
    minor: toNumber(response.protocol_minor_ver, "epoch_parameters.protocol_minor_ver"),
  },
  maxValueSize: toNumber(response.max_val_size, "epoch_parameters.max_val_size"),
  collateralPercentage: toNumber(response.collateral_percent, "epoch_parameters.collateral_percent"),
  maxCollateralInputs: toNumber(response.max_collateral_inputs, "epoch_parameters.max_collateral_inputs"),
  costModels: mapCostModels(response.cost_models_raw),
  prices: {
    memory: toNumber(response.price_mem, "epoch_parameters.price_mem"),
    steps: toNumber(response.price_step, "epoch_parameters.price_step"),
  },
  maxExecutionUnitsPerTransaction: {
    memory: toNumber(response.max_tx_ex_mem, "epoch_parameters.max_tx_ex_mem"),
    steps: toNumber(response.max_tx_ex_steps, "epoch_parameters.max_tx_ex_steps"),
  },
  maxExecutionUnitsPerBlock: {
    memory: toNumber(response.max_block_ex_mem, "epoch_parameters.max_block_ex_mem"),
    steps: toNumber(response.max_block_ex_steps, "epoch_parameters.max_block_ex_steps"),
  },
  minFeeCoefficient: toNumber(response.min_fee_a, "epoch_parameters.min_fee_a"),
  minFeeConstant: toNumber(response.min_fee_b, "epoch_parameters.min_fee_b"),
  minFeeRefScriptCostPerByte: String(response.min_fee_ref_script_cost_per_byte ?? 0),
});

const buildValidityInterval = (
  tip: BlockfrostLatestBlockResponse,
  genesis: BlockfrostGenesisResponse,
): CardanoTypes.ValidityInterval => {
  const slotLength = Math.max(toNumber(genesis.slot_length, "genesis.slot_length"), 1);
  const slotOffset = (seconds: number) => Math.max(1, Math.ceil(seconds / slotLength));
  // Deployment txs are built offline and signed manually — no expiry needed.
  return {};
};

export const getBlockfrostBuildContext = async (
  network: BlockfrostNetwork,
  apiKey: string,
  dependencies: BlockfrostBuildContextDependencies = {},
): Promise<BlockfrostBuildContext> => {
  const fetchFn = dependencies.fetchFn ?? fetch;
  const [latestBlock, genesis, epochParameters] = await Promise.all([
    fetchBlockfrostJson<BlockfrostLatestBlockResponse>("/blocks/latest", apiKey, network, fetchFn),
    fetchBlockfrostJson<BlockfrostGenesisResponse>("/genesis", apiKey, network, fetchFn),
    fetchBlockfrostJson<BlockfrostEpochParametersResponse>("/epochs/latest/parameters", apiKey, network, fetchFn),
  ]);

  return {
    protocolParameters: mapBlockfrostProtocolParameters(epochParameters),
    validityInterval: buildValidityInterval(latestBlock, genesis),
  };
};
