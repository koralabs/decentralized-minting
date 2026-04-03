import { Buffer } from "node:buffer";

import {
  type Address,
  type TxInput,
  decodeNativeScript,
  makeAddress,
  makeAssetClass,
  makeAssets,
  makeInlineTxOutputDatum,
  makeTxOutput,
  makeValue,
  type Tx,
} from "@helios-lang/ledger";
import { makeTxBuilder } from "@helios-lang/tx-utils";
import { decodeUplcData, decodeUplcProgramV2FromCbor } from "@helios-lang/uplc";

import { PREFIX_222 } from "./constants/index.js";
import { buildContracts } from "./contracts/config.js";
import { buildSettingsData } from "./contracts/data/settings.js";
import { buildSettingsV1Data } from "./contracts/data/settings-v1.js";
import type { DesiredContractTarget, DesiredDeploymentState } from "./deploymentState.js";
import { getBlockfrostV0Client } from "./helpers/blockfrost/client.js";
import { deploy } from "./txs/deploy.js";
import { fetchNetworkParameters } from "./utils/index.js";

export interface DeployerWallet {
  address: Address;
  utxos: TxInput[];
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

  const address = makeAddress(bech32);
  if (address.spendingCredential.kind !== "PubKeyHash") {
    throw new Error(`deployer address from ${rootHandle} is not a PubKeyHash address`);
  }

  const client = getBlockfrostV0Client(blockfrostApiKey);
  const utxos = await client.getUtxos(address);
  if (utxos.length === 0) {
    throw new Error(`deployer wallet ${bech32} has no UTxOs`);
  }

  return { address, utxos };
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
}): Promise<TxInput> => {
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
  const handleData = await response.json() as { utxo?: string };
  const utxoRef = handleData?.utxo;
  if (!utxoRef) {
    throw new Error(`handle ${handleName} has no UTxO`);
  }

  const [txHash, txIndexStr] = utxoRef.split("#");
  const { makeTxOutputId, makeTxId } = await import("@helios-lang/ledger");
  const client = getBlockfrostV0Client(blockfrostApiKey);
  return client.getUtxo(makeTxOutputId(makeTxId(txHash), Number.parseInt(txIndexStr, 10)));
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
  changeAddress: Address;
  spareUtxos: TxInput[];
  nativeScriptCborHex?: string;
  blockfrostApiKey?: string;
  userAgent?: string;
}): Promise<Tx> => {
  const networkParametersResult = await fetchNetworkParameters(desired.network);
  if (!networkParametersResult.ok) {
    throw new Error("Failed to fetch network parameter");
  }

  const txBuilder = makeTxBuilder({ isMainnet: desired.network === "mainnet" });

  // Attach the native script so helios allows spending from the script address
  if (nativeScriptCborHex) {
    const nativeScript = decodeNativeScript(Buffer.from(nativeScriptCborHex, "hex"));
    txBuilder.attachNativeScript(nativeScript);
  }

  const deployData = await deploy({
    network: desired.network,
    mintVersion: BigInt(desired.buildParameters.mintVersion),
    legacyPolicyId: desired.buildParameters.legacyPolicyId,
    adminVerificationKeyHash: desired.buildParameters.adminVerificationKeyHash,
    contractName: contract.build.contractName,
  });

  const handleAssetClass = makeAssetClass(
    `${desired.buildParameters.legacyPolicyId}.${PREFIX_222}${Buffer.from(handleName, "utf8").toString("hex")}`
  );
  const handleValue = makeValue(1n, makeAssets([[handleAssetClass, 1n]]));

  // Look for the handle in the deployer's UTxOs first
  let handleInputIndex = spareUtxos.findIndex((utxo) => utxo.value.isGreaterOrEqual(handleValue));

  if (handleInputIndex < 0 && blockfrostApiKey && userAgent) {
    // Handle is at the sendAddress (native script address) — fetch it by UTxO ref
    const handleUtxo = await resolveHandleUtxo({
      network: desired.network,
      handleName,
      userAgent,
      blockfrostApiKey,
    });
    spareUtxos.push(handleUtxo);
    handleInputIndex = spareUtxos.length - 1;
  }

  if (handleInputIndex < 0) {
    throw new Error(`Cannot find $${handleName} UTxO`);
  }

  const handleInput = spareUtxos.splice(handleInputIndex, 1)[0];
  txBuilder.spendUnsafe(handleInput);

  // Send the output back to the handle's current address (the sendAddress)
  // with the new reference script and datum
  const outputAddress = handleInput.address ?? changeAddress;
  const output = makeTxOutput(
    outputAddress,
    handleValue,
    deployData.datumCbor ? makeInlineTxOutputDatum(decodeUplcData(deployData.datumCbor)) : undefined,
    decodeUplcProgramV2FromCbor(deployData.optimizedCbor)
  );
  output.correctLovelace(networkParametersResult.data);
  txBuilder.addOutput(output);

  return await txBuilder.buildUnsafe({
    changeAddress,
    spareUtxos,
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
  changeAddress: Address;
  spareUtxos: TxInput[];
  nativeScriptCborHex?: string;
  blockfrostApiKey?: string;
  userAgent?: string;
}): Promise<Tx> => {
  const networkParametersResult = await fetchNetworkParameters(desired.network);
  if (!networkParametersResult.ok) {
    throw new Error("Failed to fetch network parameter");
  }

  const txBuilder = makeTxBuilder({ isMainnet: desired.network === "mainnet" });

  if (nativeScriptCborHex) {
    txBuilder.attachNativeScript(decodeNativeScript(Buffer.from(nativeScriptCborHex, "hex")));
  }

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

  // Resolve the settings handle UTxO
  const handleAssetClass = makeAssetClass(
    `${desired.buildParameters.legacyPolicyId}.${PREFIX_222}${Buffer.from(settingsHandleName, "utf8").toString("hex")}`
  );
  const handleValue = makeValue(1n, makeAssets([[handleAssetClass, 1n]]));

  let handleInputIndex = spareUtxos.findIndex((utxo) => utxo.value.isGreaterOrEqual(handleValue));
  if (handleInputIndex < 0 && blockfrostApiKey && userAgent) {
    const handleUtxo = await resolveHandleUtxo({
      network: desired.network,
      handleName: settingsHandleName,
      userAgent,
      blockfrostApiKey,
    });
    spareUtxos.push(handleUtxo);
    handleInputIndex = spareUtxos.length - 1;
  }
  if (handleInputIndex < 0) {
    throw new Error(`Cannot find $${settingsHandleName} UTxO`);
  }

  const handleInput = spareUtxos.splice(handleInputIndex, 1)[0];
  txBuilder.spendUnsafe(handleInput);

  const outputAddress = handleInput.address ?? changeAddress;
  const output = makeTxOutput(
    outputAddress,
    handleValue,
    makeInlineTxOutputDatum(settingsData)
  );
  output.correctLovelace(networkParametersResult.data);
  txBuilder.addOutput(output);

  return await txBuilder.buildUnsafe({
    changeAddress,
    spareUtxos,
  });
};
