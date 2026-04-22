import { Buffer } from "node:buffer";

import type { Cardano as CardanoTypes } from "@cardano-sdk/core";
import { roundRobinRandomImprove, type SelectionSkeleton } from "@cardano-sdk/input-selection";
import {
  computeMinimumCoinQuantity,
  createTransactionInternals,
  defaultSelectionConstraints,
  GreedyTxEvaluator,
} from "@cardano-sdk/tx-construction";
import type { HexBlob } from "@cardano-sdk/util";
import { fetch as crossFetch } from "cross-fetch";

import { LEGACY_POLICY_ID, PREFIX_222 } from "./constants/index.js";
import { buildContracts } from "./contracts/config.js";
import {
  mkBytes,
  mkConstr,
  plutusDataToCbor,
} from "./contracts/data/plutusData.js";
import { buildSettingsData } from "./contracts/data/settings.js";
import { buildSettingsV1Data } from "./contracts/data/settings-v1.js";
import { handlesApiBaseUrlForNetwork } from "./deploymentPlan.js";
import type { DesiredContractTarget, DesiredDeploymentState } from "./deploymentState.js";
import { type BlockfrostBuildContext, getBlockfrostBuildContext } from "./helpers/cardano-sdk/blockfrostContext.js";
import { fetchBlockfrostUtxos } from "./helpers/cardano-sdk/blockfrostUtxo.js";
import {
  asPaymentAddress,
  buildPlaceholderSignatures,
  Cardano,
  computeScriptDataHash,
  plutusV2ScriptHash,
  Serialization,
  transactionHashFromCore,
  transactionToCbor,
} from "./helpers/cardano-sdk/index.js";
import { deploy } from "./txs/deploy.js";

export interface DeployerWallet {
  address: string;
  utxos: CardanoTypes.Utxo[];
}

export interface BuiltTransaction {
  cborHex: string;
  estimatedSignedTxSize: number;
  /** UTxO refs consumed as inputs (txHash#index), for excluding from subsequent txs */
  consumedInputs: Set<string>;
  /**
   * The body-hash / txId of the unsigned tx. Deterministic from the body —
   * does NOT change when the operator adds signatures in Eternl. Lets a
   * later tx in the same plan reference an output of this one even before
   * this tx has confirmed on chain (chained-tx pattern, used by
   * `buildMptRootMigrationTx` to reference the predicted admin-funding
   * outputs without waiting for them to land).
   */
  txHash: string;
}

export const resolveDeployerWallet = async ({
  network,
  currentSubhandle,
  userAgent,
  blockfrostApiKey,
  fetchFn = fetch,
}: {
  network: "preview" | "preprod" | "mainnet";
  currentSubhandle: string;
  userAgent: string;
  blockfrostApiKey: string;
  fetchFn?: typeof fetch;
}): Promise<DeployerWallet> => {
  const baseUrl =
    network === "preview" ? "https://preview.api.handle.me" :
    network === "preprod" ? "https://preprod.api.handle.me" :
    "https://api.handle.me";

  // The subhandle (e.g. demimntmpt1@handlecontract) sits at a script address.
  // The deployer is the holder of the root handle (e.g. handlecontract).
  const rootHandle = currentSubhandle.split("@").pop();
  if (!rootHandle) {
    throw new Error(`cannot extract root handle from ${currentSubhandle}`);
  }

  const response = await fetchFn(
    `${baseUrl}/handles/${encodeURIComponent(rootHandle)}`,
    { headers: { "User-Agent": userAgent } }
  );
  if (!response.ok) {
    throw new Error(`failed to resolve deployer from root handle ${rootHandle}: HTTP ${response.status}`);
  }
  const handle = await response.json() as { holder?: string; resolved_addresses?: { ada?: string } };
  const bech32 = handle.resolved_addresses?.ada ?? handle.holder ?? "";
  if (!bech32) {
    throw new Error(`root handle ${rootHandle} has no resolved ADA address`);
  }

  // Verify it's a PubKeyHash address
  const parsed = Cardano.Address.fromString(bech32);
  if (!parsed) {
    throw new Error(`invalid deployer address from ${rootHandle}: ${bech32}`);
  }
  const base = parsed.asBase();
  const enterprise = parsed.asEnterprise();
  const paymentCredential =
    base?.getPaymentCredential() ??
    enterprise?.getPaymentCredential();
  if (!paymentCredential || paymentCredential.type !== Cardano.CredentialType.KeyHash) {
    throw new Error(`deployer address from ${rootHandle} is not a PubKeyHash address`);
  }

  const utxos = await fetchBlockfrostUtxos(bech32, blockfrostApiKey, network, fetchFn);
  if (utxos.length === 0) {
    throw new Error(`deployer wallet ${bech32} has no UTxOs`);
  }

  return { address: bech32, utxos };
};

export const resolveHandleUtxo = async ({
  network,
  handleName,
  userAgent,
  blockfrostApiKey,
  fetchFn = fetch,
}: {
  network: "preview" | "preprod" | "mainnet";
  handleName: string;
  userAgent: string;
  blockfrostApiKey: string;
  fetchFn?: typeof fetch;
}): Promise<CardanoTypes.Utxo> => {
  const baseUrl =
    network === "preview" ? "https://preview.api.handle.me" :
    network === "preprod" ? "https://preprod.api.handle.me" :
    "https://api.handle.me";

  const response = await fetchFn(
    `${baseUrl}/handles/${encodeURIComponent(handleName)}`,
    { headers: { "User-Agent": userAgent } }
  );
  if (!response.ok) {
    throw new Error(`failed to look up handle ${handleName}: HTTP ${response.status}`);
  }
  const handleData = await response.json() as {
    utxo?: string;
    resolved_addresses?: { ada?: string };
  };
  const utxoRef = handleData?.utxo;
  if (!utxoRef) {
    throw new Error(`handle ${handleName} has no UTxO`);
  }
  const handleAddress = handleData.resolved_addresses?.ada;
  if (!handleAddress) {
    throw new Error(`handle ${handleName} has no resolved ADA address`);
  }

  const [txHash, txIndexStr] = utxoRef.split("#");
  const txIndex = Number.parseInt(txIndexStr, 10);

  // Fetch the actual UTxO data from Blockfrost to get the full value
  const host = `https://cardano-${network}.blockfrost.io/api/v0`;
  const utxoResponse = await fetchFn(
    `${host}/txs/${txHash}/utxos`,
    { headers: { "Content-Type": "application/json", project_id: blockfrostApiKey } },
  );
  if (!utxoResponse.ok) {
    throw new Error(`failed to fetch UTxO ${utxoRef} from Blockfrost: HTTP ${utxoResponse.status}`);
  }
  const txUtxos = await utxoResponse.json() as {
    outputs: Array<{
      output_index: number;
      amount: { unit: string; quantity: string }[];
      inline_datum: string | null;
    }>;
  };
  const output = txUtxos.outputs.find((o) => o.output_index === txIndex);
  if (!output) {
    throw new Error(`UTxO ${utxoRef} not found in Blockfrost tx outputs`);
  }

  // Build the value
  let coins = 0n;
  const assets = new Map<CardanoTypes.AssetId, bigint>();
  for (const { unit, quantity } of output.amount) {
    if (unit === "lovelace") {
      coins = BigInt(quantity);
    } else {
      const policyId = unit.slice(0, 56);
      const assetName = unit.slice(56);
      const assetId = Cardano.AssetId.fromParts(
        Cardano.PolicyId(policyId as HexBlob),
        Cardano.AssetName(assetName as HexBlob),
      );
      assets.set(assetId, BigInt(quantity));
    }
  }

  const txIn: CardanoTypes.HydratedTxIn = {
    txId: Cardano.TransactionId(txHash as HexBlob),
    index: txIndex,
    address: asPaymentAddress(handleAddress),
  };
  const txOut: CardanoTypes.TxOut = {
    address: asPaymentAddress(handleAddress),
    value: { coins, ...(assets.size > 0 ? { assets } : {}) },
    ...(output.inline_datum
      ? { datum: Serialization.PlutusData.fromCbor(output.inline_datum as HexBlob).toCore() }
      : {}),
  };

  return [txIn, txOut];
};

const parseNativeScript = (cborHex: string): CardanoTypes.NativeScript =>
  Serialization.NativeScript.fromCbor(cborHex as HexBlob).toCore();

const toUtxoRef = (utxo: CardanoTypes.Utxo): string => {
  const [txIn] = utxo;
  return `${txIn.txId}#${txIn.index}`;
};

const buildUnsignedTxForFee = ({
  selection,
  requestedOutputs,
  validityInterval,
  nativeScript,
}: {
  selection: SelectionSkeleton;
  requestedOutputs: CardanoTypes.TxOut[];
  validityInterval: CardanoTypes.ValidityInterval;
  nativeScript?: CardanoTypes.NativeScript;
}): CardanoTypes.Tx => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyWithHash = createTransactionInternals({ inputSelection: selection, validityInterval, outputs: requestedOutputs } as any);

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    id: transactionHashFromCore({ body: bodyWithHash.body } as any) as CardanoTypes.TransactionId,
    body: bodyWithHash.body,
    witness: {
      signatures: buildPlaceholderSignatures(2),
      ...(nativeScript ? { scripts: [nativeScript] } : {}),
    },
  };
};

export const buildReferenceScriptDeploymentTx = async ({
  desired,
  contract,
  handleName,
  changeAddress: _changeAddress,
  spareUtxos: _spareUtxos,
  nativeScriptCborHex,
  blockfrostApiKey,
  userAgent,
  excludeUtxoRefs,
}: {
  desired: DesiredDeploymentState;
  contract: DesiredContractTarget;
  handleName: string;
  changeAddress: string;
  spareUtxos: CardanoTypes.Utxo[];
  nativeScriptCborHex?: string;
  blockfrostApiKey?: string;
  userAgent?: string;
  excludeUtxoRefs?: Set<string>;
}): Promise<BuiltTransaction> => {
  if (!blockfrostApiKey || !userAgent) {
    throw new Error("blockfrostApiKey and userAgent are required for building deployment transactions");
  }

  const buildContext = await getBlockfrostBuildContext(desired.network, blockfrostApiKey);

  const deployData = await deploy({
    network: desired.network,
    mintVersion: BigInt(desired.buildParameters.mintVersion),
    legacyPolicyId: desired.buildParameters.legacyPolicyId,
    adminVerificationKeyHash: desired.buildParameters.adminVerificationKeyHash,
    contractName: contract.build.contractName,
  });

  // Build the handle asset ID
  const handleHex = Buffer.from(handleName, "utf8").toString("hex");
  const handleAssetId = Cardano.AssetId.fromParts(
    Cardano.PolicyId(desired.buildParameters.legacyPolicyId as HexBlob),
    Cardano.AssetName(`${PREFIX_222}${handleHex}` as HexBlob),
  );

  // Resolve the handle UTxO and its script address
  const handleUtxo = await resolveHandleUtxo({
    network: desired.network,
    handleName,
    userAgent,
    blockfrostApiKey,
  });
  const scriptAddress = handleUtxo[1].address;

  // All inputs and change stay within the script address — only the native script
  // signer is needed (no deployer wallet signature required).
  // Exclude UTxOs with reference scripts — spending them adds their script
  // size to the tx fee via minFeeRefScriptCostPerByte (Conway tiered pricing).
  const allScriptUtxos = await fetchBlockfrostUtxos(
    scriptAddress as string, blockfrostApiKey, desired.network, fetch,
    { excludeWithReferenceScripts: true },
  );

  const handleValue: CardanoTypes.Value = {
    coins: 0n,
    assets: new Map([[handleAssetId, 1n]]),
  };

  // Build the reference script (PlutusV2)
  const scriptReference: CardanoTypes.Script = Serialization.PlutusV2Script.fromCbor(
    deployData.optimizedCbor as HexBlob,
  ).toCore();

  // Build the inline datum if present
  const datum = deployData.datumCbor
    ? Serialization.PlutusData.fromCbor(deployData.datumCbor as HexBlob).toCore()
    : undefined;

  // Build the output
  const minimumCoinQuantity = computeMinimumCoinQuantity(buildContext.protocolParameters.coinsPerUtxoByte);
  const handleOutput: CardanoTypes.TxOut = {
    address: scriptAddress,
    value: handleValue,
    ...(datum ? { datum } : {}),
    scriptReference,
  };
  handleOutput.value = {
    ...handleOutput.value,
    coins: minimumCoinQuantity(handleOutput),
  };

  const requestedOutputs = [handleOutput];
  const nativeScript = nativeScriptCborHex ? parseNativeScript(nativeScriptCborHex) : undefined;

  // Pre-select the handle UTxO; remaining script address UTxOs cover fees.
  // Only use UTxOs without handle tokens as fee inputs — handles assigned to
  // settings or contracts must reside alone in their UTxO, never bundled
  // into a change output with other handles.
  const handleUtxoRef = toUtxoRef(handleUtxo);
  const selectedUtxos = [handleUtxo];
  const remainingUtxos = allScriptUtxos.filter((u) => {
    if (toUtxoRef(u) === handleUtxoRef) return false;
    const hasHandleToken = u[1].value.assets?.size ?? 0;
    return !hasHandleToken;
  });

  return buildAndSerializeTx({
    selectedUtxos,
    remainingUtxos,
    requestedOutputs,
    changeAddress: scriptAddress as string,
    buildContext,
    nativeScript,
    excludeUtxoRefs,
  });
};

export const buildSettingsUpdateTx = async ({
  desired,
  settingsHandleName,
  changeAddress: _changeAddress,
  spareUtxos: _spareUtxos,
  nativeScriptCborHex,
  blockfrostApiKey,
  userAgent,
  excludeUtxoRefs,
}: {
  desired: DesiredDeploymentState;
  settingsHandleName: string;
  changeAddress: string;
  spareUtxos: CardanoTypes.Utxo[];
  nativeScriptCborHex?: string;
  blockfrostApiKey?: string;
  userAgent?: string;
  excludeUtxoRefs?: Set<string>;
}): Promise<BuiltTransaction> => {
  if (!blockfrostApiKey || !userAgent) {
    throw new Error("blockfrostApiKey and userAgent are required for building settings update transactions");
  }

  const buildContext = await getBlockfrostBuildContext(desired.network, blockfrostApiKey);

  // Build expected contract state to get new hashes
  const built = buildContracts({
    network: desired.network,
    mint_version: BigInt(desired.buildParameters.mintVersion),
    legacy_policy_id: desired.buildParameters.legacyPolicyId,
    admin_verification_key_hash: desired.buildParameters.adminVerificationKeyHash,
  });

  // Build the new settings datum
  const desiredSettings = desired.settings.values["demi@handle_settings"];
  if (!desiredSettings) {
    throw new Error("Missing demi@handle_settings in desired settings");
  }

  const settingsV1Data = buildSettingsV1Data({
    policy_id: desiredSettings.policy_id as string,
    allowed_minters: desiredSettings.allowed_minters as string[],
    valid_handle_price_assets: desiredSettings.valid_handle_price_assets as string[],
    treasury_address: desiredSettings.treasury_address as string,
    treasury_fee_percentage: BigInt(desiredSettings.treasury_fee_percentage as number),
    pz_script_address: desiredSettings.pz_script_address as string,
    order_script_hash: built.orders.validatorHash,
    minting_data_script_hash: built.mintingData.validatorHash,
  });

  const settingsData = buildSettingsData({
    mint_governor: built.mintV1.validatorHash,
    mint_version: BigInt(desired.buildParameters.mintVersion),
    data: settingsV1Data,
  });

  const settingsDatumCbor = plutusDataToCbor(settingsData);
  const datum = Serialization.PlutusData.fromCbor(settingsDatumCbor as HexBlob).toCore();

  // Resolve the settings handle UTxO and its script address
  const handleUtxo = await resolveHandleUtxo({
    network: desired.network,
    handleName: settingsHandleName,
    userAgent,
    blockfrostApiKey,
  });
  const scriptAddress = handleUtxo[1].address;

  // All inputs and change stay within the script address — only the native script
  // signer is needed (no deployer wallet signature required).
  // Exclude UTxOs with reference scripts — spending them adds their script
  // size to the tx fee via minFeeRefScriptCostPerByte (Conway tiered pricing).
  const allScriptUtxos = await fetchBlockfrostUtxos(
    scriptAddress as string, blockfrostApiKey, desired.network, fetch,
    { excludeWithReferenceScripts: true },
  );

  const handleHex = Buffer.from(settingsHandleName, "utf8").toString("hex");
  const handleAssetId = Cardano.AssetId.fromParts(
    Cardano.PolicyId(desired.buildParameters.legacyPolicyId as HexBlob),
    Cardano.AssetName(`${PREFIX_222}${handleHex}` as HexBlob),
  );
  const handleValue: CardanoTypes.Value = {
    coins: 0n,
    assets: new Map([[handleAssetId, 1n]]),
  };

  const minimumCoinQuantity = computeMinimumCoinQuantity(buildContext.protocolParameters.coinsPerUtxoByte);
  const handleOutput: CardanoTypes.TxOut = {
    address: scriptAddress,
    value: handleValue,
    datum,
  };
  handleOutput.value = {
    ...handleOutput.value,
    coins: minimumCoinQuantity(handleOutput),
  };

  const requestedOutputs = [handleOutput];
  const nativeScript = nativeScriptCborHex ? parseNativeScript(nativeScriptCborHex) : undefined;

  // Pre-select the settings handle UTxO; remaining clean UTxOs cover fees.
  // Only use UTxOs without tokens as fee inputs — other handles at this address
  // (e.g. hal_pz@handle_settings) must not be consumed as fee inputs.
  const handleUtxoRef = toUtxoRef(handleUtxo);
  const selectedUtxos = [handleUtxo];
  const remainingUtxos = allScriptUtxos.filter((u) => {
    if (toUtxoRef(u) === handleUtxoRef) return false;
    const hasTokens = u[1].value.assets?.size ?? 0;
    return !hasTokens;
  });

  return buildAndSerializeTx({
    selectedUtxos,
    remainingUtxos,
    requestedOutputs,
    changeAddress: scriptAddress as string,
    buildContext,
    nativeScript,
    excludeUtxoRefs,
  });
};

const buildAndSerializeTx = async ({
  selectedUtxos,
  remainingUtxos,
  requestedOutputs,
  changeAddress,
  buildContext,
  nativeScript,
  excludeUtxoRefs,
}: {
  selectedUtxos: CardanoTypes.Utxo[];
  remainingUtxos: CardanoTypes.Utxo[];
  requestedOutputs: CardanoTypes.TxOut[];
  changeAddress: string;
  buildContext: BlockfrostBuildContext;
  nativeScript?: CardanoTypes.NativeScript;
  excludeUtxoRefs?: Set<string>;
}): Promise<BuiltTransaction> => {
  // Filter out UTxOs consumed by previous txs in the same plan
  if (excludeUtxoRefs?.size) {
    selectedUtxos = selectedUtxos.filter((u) => !excludeUtxoRefs.has(toUtxoRef(u)));
    remainingUtxos = remainingUtxos.filter((u) => !excludeUtxoRefs.has(toUtxoRef(u)));
  }
  const changeAddressBech32 = asPaymentAddress(changeAddress);

  const inputSelector = roundRobinRandomImprove({
    changeAddressResolver: {
      resolve: async (selection) =>
        selection.change.map((change) => ({
          ...change,
          address: changeAddressBech32,
        })),
    },
  });

  const txEvaluator = new GreedyTxEvaluator(async () => buildContext.protocolParameters);

  const buildForSelection = (selection: SelectionSkeleton) =>
    Promise.resolve(
      buildUnsignedTxForFee({
        selection,
        requestedOutputs,
        validityInterval: buildContext.validityInterval,
        nativeScript,
      }),
    );

  const selection = await inputSelector.select({
    preSelectedUtxo: new Set(selectedUtxos),
    utxo: new Set(remainingUtxos),
    outputs: new Set(requestedOutputs),
    constraints: defaultSelectionConstraints({
      protocolParameters: buildContext.protocolParameters,
      buildTx: buildForSelection,
      redeemersByType: {},
      txEvaluator,
    }),
  });

  // Build the final tx using the fee from coin selection (which was computed
  // from the full estimation tx including placeholder signatures and native script).
  // createTransactionInternals recalculates the fee from the bare body, which
  // underestimates because it doesn't include witness overhead. Use the
  // selection's fee instead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalTxBodyWithHash = createTransactionInternals({ inputSelection: selection.selection, validityInterval: buildContext.validityInterval, outputs: requestedOutputs } as any);

  const selectionFee = selection.selection.fee;

  // Unsigned tx with native script witness (no signatures — Eternl will sign)
  const unsignedTx: CardanoTypes.Tx = {
    id: finalTxBodyWithHash.hash,
    body: { ...finalTxBodyWithHash.body, fee: selectionFee },
    witness: {
      signatures: new Map(),
      ...(nativeScript ? { scripts: [nativeScript] } : {}),
    },
  };

  // Estimate signed size by adding placeholder signatures
  const estimationTx: CardanoTypes.Tx = {
    ...unsignedTx,
    witness: {
      ...unsignedTx.witness,
      signatures: buildPlaceholderSignatures(1),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const estimatedSignedTxSize = Serialization.Transaction.fromCore(estimationTx as any).toCbor().length / 2;

  const cborHex = transactionToCbor(unsignedTx);

  // Collect all inputs consumed by this tx
  const consumedInputs = new Set<string>();
  for (const utxo of selection.selection.inputs) {
    consumedInputs.add(toUtxoRef(utxo));
  }

  // Body-hash / txId from `unsignedTx.id` (set above to
  // `finalTxBodyWithHash.hash`). String form so callers can build
  // chained-input references without depending on cardano-sdk's
  // TransactionId type.
  const txHash = String(unsignedTx.id);

  return { cborHex, estimatedSignedTxSize, consumedInputs, txHash };
};

/**
 * Predicted UTxOs that an unsubmitted `buildPreparationTx` output will
 * create at the admin address once it lands. Lets the migration tx that
 * follows in the same plan reference these inputs without waiting for
 * the funding tx to confirm — the operator signs both, submits in
 * order, and the node accepts the chain.
 */
export interface PendingAdminFundingUtxos {
  /** Pure-ADA UTxO sized for collateral (≥ minCollateralPercentage% of fee). */
  collateralUtxo: CardanoTypes.Utxo;
  /** Pure-ADA UTxO sized to cover the migration tx's fee + change. */
  feeUtxo: CardanoTypes.Utxo;
}

export interface PreparationTx extends BuiltTransaction {
  /**
   * The two outputs this funding tx creates at the admin address — one
   * sized for collateral, one sized for fee. Pass into
   * `buildMptRootMigrationTx` via its `pendingAdminFunding` param so
   * the migration tx references these unconfirmed UTxOs directly,
   * eliminating the two-phase deploy.
   */
  pendingAdminFundingUtxos: PendingAdminFundingUtxos;
}

const COLLATERAL_OUTPUT_LOVELACE = 6_000_000n;
const FEE_OUTPUT_LOVELACE = 4_000_000n;

/**
 * Build an unsigned preparation tx that funds the admin address from the
 * script address. Always emits TWO outputs at admin — one sized for
 * collateral (6 ADA), one for fee + change (4 ADA) — so the migration
 * tx that follows can reference them as separate inputs (collateral and
 * regular input slots cannot share a UTxO).
 *
 * Returns null if the admin address already has BOTH a collateral-
 * sized UTxO and a fee-sized UTxO on chain — in that case no funding
 * is needed and the migration tx can use admin's existing UTxOs.
 */
export const buildPreparationTx = async ({
  desired,
  nativeScriptCborHex,
  blockfrostApiKey,
  userAgent,
  excludeUtxoRefs,
}: {
  desired: DesiredDeploymentState;
  nativeScriptCborHex?: string;
  blockfrostApiKey: string;
  userAgent: string;
  excludeUtxoRefs?: Set<string>;
}): Promise<PreparationTx | null> => {
  const isMainnet = desired.network === "mainnet";
  const adminKeyHash = desired.buildParameters.adminVerificationKeyHash;
  const adminCredential = {
    type: Cardano.CredentialType.KeyHash,
    hash: adminKeyHash as unknown as CardanoTypes.Credential["hash"],
  };
  const adminAddress = Cardano.EnterpriseAddress.fromCredentials(
    isMainnet ? 1 : 0,
    adminCredential,
  )
    .toAddress()
    .toBech32() as string;

  const adminUtxos = await fetchBlockfrostUtxos(
    adminAddress,
    blockfrostApiKey,
    desired.network,
  );
  // Funding is unnecessary only when admin already has BOTH a clean
  // ADA-only UTxO ≥ COLLATERAL_OUTPUT_LOVELACE (for collateral) AND a
  // distinct clean ADA-only UTxO ≥ FEE_OUTPUT_LOVELACE (for the fee
  // input). One UTxO can't fill both slots: regular `inputs` and
  // `collateral` are separate fields and share-via-double-spending is
  // rejected by the ledger.
  const cleanAdminUtxos = adminUtxos
    .filter((u) => !u[1].value.assets || u[1].value.assets.size === 0)
    .sort((a, b) => Number((b[1].value.coins ?? 0n) - (a[1].value.coins ?? 0n)));
  const hasCollateralReady = cleanAdminUtxos.some((u) => (u[1].value.coins ?? 0n) >= COLLATERAL_OUTPUT_LOVELACE);
  const hasFeeAndCollateralPair = cleanAdminUtxos.length >= 2
    && (cleanAdminUtxos[0][1].value.coins ?? 0n) >= COLLATERAL_OUTPUT_LOVELACE
    && (cleanAdminUtxos[1][1].value.coins ?? 0n) >= FEE_OUTPUT_LOVELACE;
  if (hasCollateralReady && hasFeeAndCollateralPair) {
    return null;
  }

  // Find a script address to source funds from — use the first settings handle's address
  const settingsHandleName = "demi@handle_settings";
  const handleUtxo = await resolveHandleUtxo({
    network: desired.network,
    handleName: settingsHandleName,
    userAgent,
    blockfrostApiKey,
  });
  const scriptAddress = handleUtxo[1].address as string;

  const buildContext = await getBlockfrostBuildContext(desired.network, blockfrostApiKey);

  const allScriptUtxos = await fetchBlockfrostUtxos(
    scriptAddress, blockfrostApiKey, desired.network, fetch,
    { excludeWithReferenceScripts: true },
  );
  const cleanUtxos = allScriptUtxos.filter((u) => {
    const hasTokens = u[1].value.assets?.size ?? 0;
    return !hasTokens;
  });
  if (cleanUtxos.length === 0) {
    throw new Error("no clean UTxOs at script address to fund admin wallet");
  }

  // Two outputs: index 0 = collateral, index 1 = fee. Index assignment
  // must match what the migration tx assumes when it builds chained
  // input refs from the funding tx hash.
  const adminPaymentAddress = asPaymentAddress(adminAddress);
  const collateralOutput: CardanoTypes.TxOut = {
    address: adminPaymentAddress,
    value: { coins: COLLATERAL_OUTPUT_LOVELACE },
  };
  const feeOutput: CardanoTypes.TxOut = {
    address: adminPaymentAddress,
    value: { coins: FEE_OUTPUT_LOVELACE },
  };

  const nativeScript = nativeScriptCborHex ? parseNativeScript(nativeScriptCborHex) : undefined;

  const built = await buildAndSerializeTx({
    selectedUtxos: [],
    remainingUtxos: cleanUtxos,
    requestedOutputs: [collateralOutput, feeOutput],
    changeAddress: scriptAddress,
    buildContext,
    nativeScript,
    excludeUtxoRefs,
  });

  // Synthesize the predicted UTxOs the funding tx will create at admin.
  // These don't exist on chain yet — `txHash` is the body hash of the
  // unsigned tx, identical post-signing because Eternl only adds
  // witnesses (which don't affect body hash).
  const fundingTxId = Cardano.TransactionId(built.txHash as HexBlob);
  const adminAddressTyped = adminPaymentAddress as unknown as CardanoTypes.TxOut["address"];
  const pendingAdminFundingUtxos: PendingAdminFundingUtxos = {
    collateralUtxo: [
      { txId: fundingTxId, index: 0, address: adminAddressTyped },
      { address: adminAddressTyped, value: { coins: COLLATERAL_OUTPUT_LOVELACE } },
    ],
    feeUtxo: [
      { txId: fundingTxId, index: 1, address: adminAddressTyped },
      { address: adminAddressTyped, value: { coins: FEE_OUTPUT_LOVELACE } },
    ],
  };

  return {
    ...built,
    pendingAdminFundingUtxos,
  };
};

/**
 * Build an unsigned tx that migrates the handle_root@handle_settings UTxO
 * from the old minting data script address to the new one, updating the
 * MPT root hash datum. Requires admin/policy key signature (not native script).
 *
 * The old validator CBOR should be the already-parameterized script as fetched
 * from the Handle API's /script endpoint for the current deployment subhandle.
 */
export const buildMptRootMigrationTx = async ({
  desired,
  newMptRootHash,
  oldValidatorCborHex,
  blockfrostApiKey,
  userAgent,
  pendingAdminFunding,
}: {
  desired: DesiredDeploymentState;
  newMptRootHash: string;
  oldValidatorCborHex: string;
  blockfrostApiKey: string;
  userAgent: string;
  /**
   * When set, the migration tx skips Blockfrost lookups for admin's
   * UTxOs and uses the predicted outputs of an unconfirmed
   * `buildPreparationTx` instead. The funding tx must be submitted
   * before this one (manifest order is enforced by the operator
   * runbook); the node accepts the chain because the funding tx
   * lands first and creates the inputs this tx then consumes.
   */
  pendingAdminFunding?: PendingAdminFundingUtxos;
}): Promise<BuiltTransaction> => {
  const isMainnet = desired.network === "mainnet";
  const adminKeyHash = desired.buildParameters.adminVerificationKeyHash;

  // Compute old script hash from its single-CBOR hex (used only for sanity).
  const _oldScriptHash = plutusV2ScriptHash(oldValidatorCborHex);
  void _oldScriptHash;

  const built = buildContracts({
    network: desired.network,
    mint_version: BigInt(desired.buildParameters.mintVersion),
    legacy_policy_id: desired.buildParameters.legacyPolicyId,
    admin_verification_key_hash: adminKeyHash,
  });
  const newScriptAddress = built.mintingData.scriptAddress;

  // Fetch handle_root UTxO from Blockfrost
  const handleName = "handle_root@handle_settings";
  const baseUrl = handlesApiBaseUrlForNetwork(desired.network);
  const handleRes = await crossFetch(
    `${baseUrl}/handles/${encodeURIComponent(handleName)}`,
    { headers: { "User-Agent": userAgent } }
  );
  if (!handleRes.ok) throw new Error(`failed to fetch ${handleName}: HTTP ${handleRes.status}`);
  const handleData = await handleRes.json() as { utxo?: string; resolved_addresses?: { ada?: string } };
  if (!handleData.utxo || !handleData.resolved_addresses?.ada) {
    throw new Error(`${handleName} missing utxo or address`);
  }

  const [txHashStr, txIdxStr] = handleData.utxo.split("#");
  const txIdx = parseInt(txIdxStr, 10);
  const host = `https://cardano-${desired.network}.blockfrost.io/api/v0`;
  const utxoRes = await crossFetch(
    `${host}/txs/${txHashStr}/utxos`,
    { headers: { "Content-Type": "application/json", project_id: blockfrostApiKey } }
  );
  if (!utxoRes.ok) throw new Error(`failed to fetch UTxO ${handleData.utxo}: HTTP ${utxoRes.status}`);
  const txUtxos = await utxoRes.json() as {
    outputs: Array<{ output_index: number; amount: { unit: string; quantity: string }[]; inline_datum?: string }>;
  };
  const output = txUtxos.outputs.find((o) => o.output_index === txIdx);
  if (!output) throw new Error(`UTxO ${handleData.utxo} not found`);

  const handleHex = Buffer.from(handleName, "utf8").toString("hex");
  const handleAssetId = Cardano.AssetId.fromParts(
    Cardano.PolicyId(LEGACY_POLICY_ID as HexBlob),
    Cardano.AssetName(`${PREFIX_222}${handleHex}` as HexBlob),
  );
  const lovelace = BigInt(output.amount.find((a) => a.unit === "lovelace")?.quantity ?? "0");

  const adminCredential = {
    type: Cardano.CredentialType.KeyHash,
    hash: adminKeyHash as unknown as CardanoTypes.Credential["hash"],
  };
  const adminAddressBech32 = Cardano.EnterpriseAddress.fromCredentials(
    isMainnet ? 1 : 0,
    adminCredential,
  )
    .toAddress()
    .toBech32() as string;
  // Resolve admin UTxOs for fee + collateral. When the planner has
  // emitted a chained `buildPreparationTx`, those outputs aren't on
  // chain yet — use the predicted UTxOs the planner returned, and
  // skip the Blockfrost lookup entirely. Otherwise fall back to the
  // existing on-chain UTxO query (admin already has funds, so the
  // planner didn't emit a funding tx).
  let walletUtxosForMigration: CardanoTypes.Utxo[];
  let collateralUtxo: CardanoTypes.Utxo | undefined;
  if (pendingAdminFunding) {
    walletUtxosForMigration = [pendingAdminFunding.feeUtxo];
    collateralUtxo = pendingAdminFunding.collateralUtxo;
  } else {
    const adminUtxos = await fetchBlockfrostUtxos(
      adminAddressBech32,
      blockfrostApiKey,
      desired.network,
    );
    const cleanUtxos = adminUtxos.filter((u) => !u[1].value.assets || u[1].value.assets.size === 0);
    const sortedClean = cleanUtxos.sort((a, b) => Number((b[1].value.coins ?? 0n) - (a[1].value.coins ?? 0n)));
    collateralUtxo = sortedClean[0];
    // Fee inputs come from admin's full UTxO set (assets included —
    // the input selector will pick what it needs and route any
    // non-ADA assets back to admin via change).
    walletUtxosForMigration = adminUtxos;
  }

  const spendInput: CardanoTypes.Utxo = [
    {
      txId: Cardano.TransactionId(txHashStr as HexBlob),
      index: txIdx,
      address: handleData.resolved_addresses.ada as unknown as CardanoTypes.TxOut["address"],
    },
    {
      address: handleData.resolved_addresses.ada as unknown as CardanoTypes.TxOut["address"],
      value: {
        coins: lovelace,
        assets: new Map([[handleAssetId, 1n]]),
      },
      ...(output.inline_datum
        ? {
            datum: Serialization.PlutusData.fromCbor(output.inline_datum as HexBlob).toCore(),
          }
        : {}),
    },
  ];

  const newDatumCbor = plutusDataToCbor(mkConstr(0, [mkBytes(newMptRootHash)]));
  const newDatumCore = Serialization.PlutusData.fromCbor(newDatumCbor as HexBlob).toCore();

  const migrationOutput: CardanoTypes.TxOut = {
    address: newScriptAddress as unknown as CardanoTypes.TxOut["address"],
    value: {
      coins: lovelace,
      assets: new Map([[handleAssetId, 1n]]),
    },
    datum: newDatumCore,
  };

  const redeemerDataCbor = plutusDataToCbor(mkConstr(2, []));
  const spendRedeemer: CardanoTypes.Redeemer = {
    data: Serialization.PlutusData.fromCbor(redeemerDataCbor as HexBlob).toCore(),
    executionUnits: { memory: 0, steps: 0 },
    index: 0,
    purpose: Cardano.RedeemerPurpose.spend,
  };

  const buildContext = await getBlockfrostBuildContext(desired.network, blockfrostApiKey);

  const oldScriptCore = Serialization.PlutusV2Script.fromCbor(
    oldValidatorCborHex as HexBlob,
  ).toCore();

  const result = await buildPlutusSpendTxInline({
    buildContext,
    spendInput,
    walletUtxos: walletUtxosForMigration,
    collateralUtxo,
    output: migrationOutput,
    spendRedeemer,
    attachedPlutusScript: oldScriptCore,
    requiredSigner: adminKeyHash,
    changeAddress: adminAddressBech32,
  });

  const estimatedSignedTxSize = Math.ceil(result.cborHex.length / 2) + 104;
  return {
    cborHex: result.cborHex,
    estimatedSignedTxSize,
    consumedInputs: result.consumedInputs,
    txHash: result.txHash,
  };
};

/**
 * Minimal Plutus-spend tx builder inlined for `buildMptRootMigrationTx` — one
 * script input, one output, attached (non-reference) Plutus V2 script, admin
 * signer. Uses the shared Conway-correct `computeScriptDataHash`.
 */
const buildPlutusSpendTxInline = async ({
  buildContext,
  spendInput,
  walletUtxos,
  collateralUtxo,
  output,
  spendRedeemer,
  attachedPlutusScript,
  requiredSigner,
  changeAddress,
}: {
  buildContext: BlockfrostBuildContext;
  spendInput: CardanoTypes.Utxo;
  walletUtxos: CardanoTypes.Utxo[];
  collateralUtxo?: CardanoTypes.Utxo;
  output: CardanoTypes.TxOut;
  spendRedeemer: CardanoTypes.Redeemer;
  attachedPlutusScript: CardanoTypes.Script;
  requiredSigner: string;
  changeAddress: string;
}): Promise<{ cborHex: string; consumedInputs: Set<string>; txHash: string }> => {
  const changeAddressBech32 = asPaymentAddress(changeAddress);
  const inputSelector = roundRobinRandomImprove({
    changeAddressResolver: {
      resolve: async (selection) =>
        selection.change.map((change) => ({
          ...change,
          address: changeAddressBech32,
        })),
    },
  });
  const txEvaluator = new GreedyTxEvaluator(
    async () => buildContext.protocolParameters,
  );

  const buildForSelection = (selection: SelectionSkeleton) =>
    Promise.resolve(
      buildPlutusTxForSelection(
        selection,
        output,
        spendRedeemer,
        "0".repeat(64),
        attachedPlutusScript,
        requiredSigner,
        collateralUtxo,
        buildContext,
      ),
    );

  const selection = await inputSelector.select({
    preSelectedUtxo: new Set([spendInput]),
    utxo: new Set(walletUtxos),
    outputs: new Set([output]),
    constraints: defaultSelectionConstraints({
      protocolParameters: buildContext.protocolParameters,
      buildTx: buildForSelection,
      redeemersByType: {
        spend: new Map([
          [`${spendInput[0].txId}#${spendInput[0].index}`, spendRedeemer],
        ]),
      },
      txEvaluator,
    }),
  });

  const scriptDataHash = computeScriptDataHash(
    buildContext.protocolParameters.costModels,
    [Cardano.PlutusLanguageVersion.V2],
    [spendRedeemer],
  );

  const finalTx = buildPlutusTxForSelection(
    selection.selection,
    output,
    spendRedeemer,
    scriptDataHash ?? "0".repeat(64),
    attachedPlutusScript,
    requiredSigner,
    collateralUtxo,
    buildContext,
  );

  const unsignedTx: CardanoTypes.Tx = {
    ...finalTx,
    body: { ...finalTx.body, fee: selection.selection.fee },
    witness: {
      ...finalTx.witness,
      signatures: new Map(),
    },
  };

  const cborHex = transactionToCbor(unsignedTx);
  const consumedInputs = new Set<string>();
  for (const u of selection.selection.inputs) {
    consumedInputs.add(`${u[0].txId}#${u[0].index}`);
  }
  const txHash = String(unsignedTx.id);
  return { cborHex, consumedInputs, txHash };
};

const buildPlutusTxForSelection = (
  selection: SelectionSkeleton,
  output: CardanoTypes.TxOut,
  spendRedeemer: CardanoTypes.Redeemer,
  scriptDataHash: string,
  attachedPlutusScript: CardanoTypes.Script,
  requiredSigner: string,
  collateralUtxo: CardanoTypes.Utxo | undefined,
  buildContext: BlockfrostBuildContext,
): CardanoTypes.Tx => {
  const bodyWithHash = createTransactionInternals({
    inputSelection: selection,
    validityInterval: buildContext.validityInterval,
    outputs: [output],
    requiredExtraSignatures: [requiredSigner],
    collaterals: collateralUtxo
      ? new Set<CardanoTypes.TxIn>([
          { txId: collateralUtxo[0].txId, index: collateralUtxo[0].index },
        ])
      : undefined,
    scriptIntegrityHash: scriptDataHash as HexBlob,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  return {
    id: transactionHashFromCore({
      body: bodyWithHash.body,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any) as unknown as CardanoTypes.TransactionId,
    body: bodyWithHash.body,
    witness: {
      signatures: buildPlaceholderSignatures(2),
      redeemers: [spendRedeemer],
      scripts: [attachedPlutusScript],
    },
  };
};

