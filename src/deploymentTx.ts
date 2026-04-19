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
import { bytesToHex } from "@helios-lang/codec-utils";
import {
  makeAddress,
  makeAssetClass,
  makeAssets,
  makeInlineTxOutputDatum,
  makePubKeyHash,
  makeTxInput,
  makeTxOutput,
  makeValidatorHash,
  makeValue,
} from "@helios-lang/ledger";
import { makeBlockfrostV0Client, makeTxBuilder } from "@helios-lang/tx-utils";
import {
  decodeUplcData,
  decodeUplcProgramV2FromCbor,
  makeByteArrayData,
  makeConstrData,
} from "@helios-lang/uplc";
import { fetch as crossFetch } from "cross-fetch";

import { LEGACY_POLICY_ID, PREFIX_222 } from "./constants/index.js";
import { buildContracts } from "./contracts/config.js";
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
    treasury_address: makeAddress(desiredSettings.treasury_address as string),
    treasury_fee_percentage: BigInt(desiredSettings.treasury_fee_percentage as number),
    pz_script_address: makeAddress(desiredSettings.pz_script_address as string),
    order_script_hash: built.orders.ordersValidatorHash.toHex(),
    minting_data_script_hash: built.mintingData.mintingDataValidatorHash.toHex(),
  });

  const settingsData = buildSettingsData({
    mint_governor: built.mintV1.mintV1ValidatorHash.toHex(),
    mint_version: BigInt(desired.buildParameters.mintVersion),
    data: settingsV1Data,
  });

  // Convert helios UplcData to cardano-sdk PlutusData via CBOR
  const settingsDatumCbor = Buffer.from(settingsData.toCbor()).toString("hex");
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

  return { cborHex, estimatedSignedTxSize, consumedInputs };
};

/**
 * Build an unsigned preparation tx that funds the admin address from the
 * script address. This is needed when the admin wallet has insufficient ADA
 * for the MPT root migration tx (which requires fees + collateral).
 *
 * Returns null if the admin address already has enough funds.
 */
export const buildPreparationTx = async ({
  desired,
  nativeScriptCborHex,
  blockfrostApiKey,
  userAgent,
  targetLovelace = 10_000_000n,
  excludeUtxoRefs,
}: {
  desired: DesiredDeploymentState;
  nativeScriptCborHex?: string;
  blockfrostApiKey: string;
  userAgent: string;
  targetLovelace?: bigint;
  excludeUtxoRefs?: Set<string>;
}): Promise<BuiltTransaction | null> => {
  const isMainnet = desired.network === "mainnet";
  const adminKeyHash = desired.buildParameters.adminVerificationKeyHash;
  const adminAddress = makeAddress(isMainnet, makePubKeyHash(adminKeyHash));

  // Check current admin balance
  const blockfrostClient = makeBlockfrostV0Client(desired.network, blockfrostApiKey);
  const adminUtxos = await blockfrostClient.getUtxos(adminAddress);
  const adminBalance = adminUtxos.reduce(
    (sum, u) => sum + u.value.lovelace, 0n
  );

  if (adminBalance >= targetLovelace) {
    return null;
  }

  const needed = targetLovelace - adminBalance;

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

  // Get clean (no-token, no-ref-script) UTxOs from the script address for fee inputs
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

  const adminAddressBech32 = asPaymentAddress(adminAddress.toBech32());
  const output: CardanoTypes.TxOut = {
    address: adminAddressBech32,
    value: { coins: needed },
  };

  const nativeScript = nativeScriptCborHex ? parseNativeScript(nativeScriptCborHex) : undefined;

  return buildAndSerializeTx({
    selectedUtxos: [],
    remainingUtxos: cleanUtxos,
    requestedOutputs: [output],
    changeAddress: scriptAddress,
    buildContext,
    nativeScript,
    excludeUtxoRefs,
  });
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
}: {
  desired: DesiredDeploymentState;
  newMptRootHash: string;
  oldValidatorCborHex: string;
  blockfrostApiKey: string;
  userAgent: string;
}): Promise<BuiltTransaction> => {
  const isMainnet = desired.network === "mainnet";
  const adminKeyHash = desired.buildParameters.adminVerificationKeyHash;

  // Decode old validator (already parameterized)
  const oldProgram = decodeUplcProgramV2FromCbor(oldValidatorCborHex);
  const oldHash = makeValidatorHash(oldProgram.hash());

  // Build new script address from current code
  const built = buildContracts({
    network: desired.network,
    mint_version: BigInt(desired.buildParameters.mintVersion),
    legacy_policy_id: desired.buildParameters.legacyPolicyId,
    admin_verification_key_hash: adminKeyHash,
  });
  const newScriptAddress = built.mintingData.mintingDataValidatorAddress;

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

  const [txHash, txIdxStr] = handleData.utxo.split("#");
  const txIdx = parseInt(txIdxStr, 10);
  const host = `https://cardano-${desired.network}.blockfrost.io/api/v0`;
  const utxoRes = await crossFetch(
    `${host}/txs/${txHash}/utxos`,
    { headers: { "Content-Type": "application/json", project_id: blockfrostApiKey } }
  );
  if (!utxoRes.ok) throw new Error(`failed to fetch UTxO ${handleData.utxo}: HTTP ${utxoRes.status}`);
  const txUtxos = await utxoRes.json() as {
    outputs: Array<{ output_index: number; amount: { unit: string; quantity: string }[]; inline_datum?: string }>;
  };
  const output = txUtxos.outputs.find((o) => o.output_index === txIdx);
  if (!output) throw new Error(`UTxO ${handleData.utxo} not found`);

  const handleHex = Buffer.from(handleName, "utf8").toString("hex");
  const handleAssetClass = makeAssetClass(`${LEGACY_POLICY_ID}.${PREFIX_222}${handleHex}`);
  const lovelace = BigInt(output.amount.find((a) => a.unit === "lovelace")?.quantity ?? "0");

  const handleUtxo = makeTxInput(
    handleData.utxo,
    makeTxOutput(
      makeAddress(handleData.resolved_addresses.ada),
      makeValue(lovelace, makeAssets([[handleAssetClass, 1n]])),
      output.inline_datum
        ? makeInlineTxOutputDatum(decodeUplcData(Buffer.from(output.inline_datum, "hex")))
        : undefined
    )
  );

  // UpdateMPT redeemer (constructor index 2, no fields)
  const redeemer = makeConstrData(2, []);

  // New datum with computed MPT root hash
  const newDatum = makeConstrData(0, [makeByteArrayData(newMptRootHash)]);

  // Build tx with helios TxBuilder
  const txBuilder = makeTxBuilder({ isMainnet });
  txBuilder.attachUplcProgram(oldProgram);
  txBuilder.spendUnsafe(handleUtxo, redeemer);
  txBuilder.payUnsafe(
    newScriptAddress,
    makeValue(lovelace, makeAssets([[handleAssetClass, 1n]])),
    makeInlineTxOutputDatum(newDatum)
  );
  txBuilder.addSigners(makePubKeyHash(adminKeyHash));

  // Fetch admin wallet UTxOs for fees and collateral
  const adminAddress = makeAddress(isMainnet, makePubKeyHash(adminKeyHash));
  const blockfrostClient = makeBlockfrostV0Client(desired.network, blockfrostApiKey);
  const adminUtxos = await blockfrostClient.getUtxos(adminAddress);

  // Pre-set collateral from a clean (ADA-only) UTxO
  const cleanUtxos = adminUtxos.filter((u) => u.value.assets.isZero());
  if (cleanUtxos.length > 0) {
    const collateral = cleanUtxos.sort((a, b) => Number(b.value.lovelace - a.value.lovelace))[0];
    txBuilder.addCollateral(collateral);
  }

  const tx = await txBuilder.buildUnsafe({
    networkParams: blockfrostClient.parameters,
    changeAddress: adminAddress,
    spareUtxos: adminUtxos,
    allowDirtyChangeOutput: true,
  });

  if (tx.hasValidationError) {
    throw new Error(`MPT root migration tx validation error: ${tx.hasValidationError}`);
  }

  const cborHex = bytesToHex(tx.toCbor());
  // Estimate signed size: the admin adds 1 signature (~100 bytes)
  const estimatedSignedTxSize = Math.ceil(cborHex.length / 2) + 104;

  // MPT migration uses the helios tx builder which doesn't expose selection,
  // but we can extract inputs from the built tx body
  const consumedInputs = new Set<string>();
  for (const input of tx.body.inputs) {
    consumedInputs.add(`${input.id.txId.toHex()}#${input.id.index}`);
  }

  return { cborHex, estimatedSignedTxSize, consumedInputs };
};

