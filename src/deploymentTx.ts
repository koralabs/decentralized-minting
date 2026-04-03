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
import { makeAddress } from "@helios-lang/ledger";

import { PREFIX_222 } from "./constants/index.js";
import { buildContracts } from "./contracts/config.js";
import { buildSettingsData } from "./contracts/data/settings.js";
import { buildSettingsV1Data } from "./contracts/data/settings-v1.js";
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
      signatures: buildPlaceholderSignatures(1),
      ...(nativeScript ? { scripts: [nativeScript] } : {}),
    },
  };
};

export const buildReferenceScriptDeploymentTx = async ({
  desired,
  contract,
  handleName,
  changeAddress,
  spareUtxos,
  nativeScriptCborHex,
  blockfrostApiKey,
  userAgent,
}: {
  desired: DesiredDeploymentState;
  contract: DesiredContractTarget;
  handleName: string;
  changeAddress: string;
  spareUtxos: CardanoTypes.Utxo[];
  nativeScriptCborHex?: string;
  blockfrostApiKey?: string;
  userAgent?: string;
}): Promise<BuiltTransaction> => {
  if (!blockfrostApiKey) {
    throw new Error("blockfrostApiKey is required for building deployment transactions");
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
  const handleValue: CardanoTypes.Value = {
    coins: 0n,
    assets: new Map([[handleAssetId, 1n]]),
  };

  // Find the handle in the deployer's UTxOs
  let handleUtxo = spareUtxos.find(([, txOut]) =>
    txOut.value.assets?.get(handleAssetId) === 1n
  );

  if (!handleUtxo && userAgent) {
    // Handle is at the sendAddress (native script address) — fetch it by UTxO ref
    handleUtxo = await resolveHandleUtxo({
      network: desired.network,
      handleName,
      userAgent,
      blockfrostApiKey,
    });
    spareUtxos = [...spareUtxos, handleUtxo];
  }

  if (!handleUtxo) {
    throw new Error(`Cannot find $${handleName} UTxO`);
  }

  // The output goes back to the handle's current address (the sendAddress)
  const outputAddress = handleUtxo[1].address;

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
    address: outputAddress,
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

  // Remove the handle UTxO from spare set — it's pre-selected
  const handleUtxoRef = toUtxoRef(handleUtxo);
  const selectedUtxos = [handleUtxo];
  const remainingUtxos = spareUtxos.filter((u) => toUtxoRef(u) !== handleUtxoRef);

  return buildAndSerializeTx({
    selectedUtxos,
    remainingUtxos,
    requestedOutputs,
    changeAddress,
    buildContext,
    nativeScript,
  });
};

export const buildSettingsUpdateTx = async ({
  desired,
  settingsHandleName,
  changeAddress,
  spareUtxos,
  nativeScriptCborHex,
  blockfrostApiKey,
  userAgent,
}: {
  desired: DesiredDeploymentState;
  settingsHandleName: string;
  changeAddress: string;
  spareUtxos: CardanoTypes.Utxo[];
  nativeScriptCborHex?: string;
  blockfrostApiKey?: string;
  userAgent?: string;
}): Promise<BuiltTransaction> => {
  if (!blockfrostApiKey) {
    throw new Error("blockfrostApiKey is required for building settings update transactions");
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

  // Resolve the settings handle UTxO
  const handleHex = Buffer.from(settingsHandleName, "utf8").toString("hex");
  const handleAssetId = Cardano.AssetId.fromParts(
    Cardano.PolicyId(desired.buildParameters.legacyPolicyId as HexBlob),
    Cardano.AssetName(`${PREFIX_222}${handleHex}` as HexBlob),
  );
  const handleValue: CardanoTypes.Value = {
    coins: 0n,
    assets: new Map([[handleAssetId, 1n]]),
  };

  let handleUtxo = spareUtxos.find(([, txOut]) =>
    txOut.value.assets?.get(handleAssetId) === 1n
  );

  if (!handleUtxo && userAgent) {
    handleUtxo = await resolveHandleUtxo({
      network: desired.network,
      handleName: settingsHandleName,
      userAgent,
      blockfrostApiKey,
    });
    spareUtxos = [...spareUtxos, handleUtxo];
  }

  if (!handleUtxo) {
    throw new Error(`Cannot find $${settingsHandleName} UTxO`);
  }

  const outputAddress = handleUtxo[1].address;
  const minimumCoinQuantity = computeMinimumCoinQuantity(buildContext.protocolParameters.coinsPerUtxoByte);
  const handleOutput: CardanoTypes.TxOut = {
    address: outputAddress,
    value: handleValue,
    datum,
  };
  handleOutput.value = {
    ...handleOutput.value,
    coins: minimumCoinQuantity(handleOutput),
  };

  const requestedOutputs = [handleOutput];
  const nativeScript = nativeScriptCborHex ? parseNativeScript(nativeScriptCborHex) : undefined;

  const handleUtxoRef = toUtxoRef(handleUtxo);
  const selectedUtxos = [handleUtxo];
  const remainingUtxos = spareUtxos.filter((u) => toUtxoRef(u) !== handleUtxoRef);

  return buildAndSerializeTx({
    selectedUtxos,
    remainingUtxos,
    requestedOutputs,
    changeAddress,
    buildContext,
    nativeScript,
  });
};

const buildAndSerializeTx = async ({
  selectedUtxos,
  remainingUtxos,
  requestedOutputs,
  changeAddress,
  buildContext,
  nativeScript,
}: {
  selectedUtxos: CardanoTypes.Utxo[];
  remainingUtxos: CardanoTypes.Utxo[];
  requestedOutputs: CardanoTypes.TxOut[];
  changeAddress: string;
  buildContext: BlockfrostBuildContext;
  nativeScript?: CardanoTypes.NativeScript;
}): Promise<BuiltTransaction> => {
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

  // Build the final tx
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalTxBodyWithHash = createTransactionInternals({ inputSelection: selection.selection, validityInterval: buildContext.validityInterval, outputs: requestedOutputs } as any);

  // Unsigned tx with native script witness (no signatures — Eternl will sign)
  const unsignedTx: CardanoTypes.Tx = {
    id: finalTxBodyWithHash.hash,
    body: finalTxBodyWithHash.body,
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

  return { cborHex, estimatedSignedTxSize };
};
