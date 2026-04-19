import { fetch } from "cross-fetch";
import { Err, Ok, Result } from "ts-res";

import {
  BLOCKFROST_API_KEY,
  LEGACY_POLICY_ID,
  MINTING_DATA_HANDLE_NAME,
  SETTINGS_HANDLE_NAME,
} from "../constants/index.js";
import { plutusDataFromCbor } from "../contracts/data/plutusData.js";
import {
  decodeHandlePriceInfoDatum,
  decodeMintingDataDatum,
  decodeSettingsDatum,
  decodeSettingsV1Data,
  HandlePriceInfo,
  MintingData,
  Settings,
  SettingsV1,
} from "../contracts/index.js";
import { type NetworkName } from "../helpers/cardano-sdk/networkName.js";
import { fetchApi, getNetwork, mayFail } from "../helpers/index.js";

/**
 * Output UTxO descriptor returned by the settings/minting-data/handle-price
 * lookups. Replaces the Helios `TxInput` with the minimum data a tx builder
 * needs to spend from — or reference — this UTxO.
 */
export interface UtxoDescriptor {
  txHash: string;
  outputIndex: number;
  address: string; // bech32
  lovelace: bigint;
  /** Non-lovelace assets, keyed by `${policyIdHex}.${assetNameHex}`. */
  assets: Map<string, bigint>;
  /** Inline datum CBOR hex, if present. */
  inlineDatumCbor?: string;
}

const blockfrostHeaders = () => ({
  project_id: BLOCKFROST_API_KEY,
  "Content-Type": "application/json",
});

const fetchCurrentAssetUtxo = async (assetId: string) => {
  const network = getNetwork(BLOCKFROST_API_KEY);
  const host = `https://cardano-${network}.blockfrost.io/api/v0`;

  const txs = (await fetch(
    `${host}/assets/${assetId}/transactions?order=desc&count=1`,
    { headers: blockfrostHeaders() },
  ).then((res) => res.json())) as { tx_hash: string }[];
  const latestTx = txs[0];
  if (!latestTx?.tx_hash) throw new Error("Minting Data UTxO Not Found");

  const txUtxos = (await fetch(
    `${host}/txs/${latestTx.tx_hash}/utxos`,
    { headers: blockfrostHeaders() },
  ).then((res) => res.json())) as {
    outputs: {
      output_index: number;
      address: string;
      amount: { unit: string; quantity: string }[];
      inline_datum?: string | null;
    }[];
  };
  const output = txUtxos.outputs.find((candidate) =>
    candidate.amount.some(
      (amount) => amount.unit === assetId && amount.quantity !== "0",
    ),
  );
  if (!output) throw new Error("Minting Data UTxO Not Found");

  return { tx_id: latestTx.tx_hash, output };
};

const makeUtxoDescriptor = (
  txHash: string,
  output: {
    output_index: number;
    address: string;
    amount: { unit: string; quantity: string }[];
    inline_datum?: string | null;
  },
): UtxoDescriptor => {
  let lovelace = 0n;
  const assets = new Map<string, bigint>();
  for (const { unit, quantity } of output.amount) {
    if (unit === "lovelace") {
      lovelace = BigInt(quantity);
    } else {
      const policyId = unit.slice(0, 56);
      const assetName = unit.slice(56);
      assets.set(`${policyId}.${assetName}`, BigInt(quantity));
    }
  }

  return {
    txHash,
    outputIndex: output.output_index,
    address: output.address,
    lovelace,
    assets,
    ...(output.inline_datum ? { inlineDatumCbor: output.inline_datum } : {}),
  };
};

const fetchSettings = async (
  network: NetworkName,
): Promise<
  Result<
    {
      settings: Settings;
      settingsV1: SettingsV1;
      settingsUtxo: UtxoDescriptor;
    },
    string
  >
> => {
  const settingsHandle = await fetchApi(`handles/${SETTINGS_HANDLE_NAME}`).then(
    (res) => res.json(),
  );
  const settingsHandleDatum: string = await fetchApi(
    `handles/${SETTINGS_HANDLE_NAME}/datum`,
    { "Content-Type": "text/plain" },
  ).then((res) => res.text());

  if (!settingsHandleDatum) {
    throw new Error("Settings Datum Not Found");
  }

  const [txHash, idxStr] = settingsHandle.utxo.split("#");
  const settingsUtxo: UtxoDescriptor = {
    txHash,
    outputIndex: Number.parseInt(idxStr, 10),
    address: settingsHandle.resolved_addresses.ada,
    lovelace: 0n,
    assets: new Map([[`${LEGACY_POLICY_ID}.${settingsHandle.hex}`, 1n]]),
    inlineDatumCbor: settingsHandleDatum,
  };

  const decodedSettingsResult = mayFail(() =>
    decodeSettingsDatum(settingsUtxo.inlineDatumCbor),
  );
  if (!decodedSettingsResult.ok) return Err(decodedSettingsResult.error);

  const decodedSettingsV1Result = mayFail(() =>
    decodeSettingsV1Data(decodedSettingsResult.data.data, network),
  );
  if (!decodedSettingsV1Result.ok) return Err(decodedSettingsV1Result.error);

  return Ok({
    settings: decodedSettingsResult.data,
    settingsV1: decodedSettingsV1Result.data,
    settingsUtxo,
  });
};

const fetchMintingData = async (): Promise<
  Result<{ mintingData: MintingData; mintingDataUtxo: UtxoDescriptor }, string>
> => {
  const mintingDataHandle = await fetchApi(
    `handles/${MINTING_DATA_HANDLE_NAME}`,
  ).then((res) => res.json());

  const mintingDataRaw = await fetchCurrentAssetUtxo(
    `${LEGACY_POLICY_ID}${mintingDataHandle.hex}`,
  );

  if (!mintingDataRaw.output.inline_datum) {
    throw new Error("Minting Data Datum Not Found");
  }

  const mintingDataUtxo = makeUtxoDescriptor(
    mintingDataRaw.tx_id,
    mintingDataRaw.output,
  );

  const decodedMintingDataResult = mayFail(() =>
    decodeMintingDataDatum(mintingDataUtxo.inlineDatumCbor),
  );
  if (!decodedMintingDataResult.ok) return Err(decodedMintingDataResult.error);

  return Ok({
    mintingData: decodedMintingDataResult.data,
    mintingDataUtxo,
  });
};

/**
 * Fetch Handle Price Info Data
 * @param handlePriceAssetName - The name of the handle price asset in UTF8
 */
const fetchHandlePriceInfoData = async (
  handlePriceAssetName: string,
): Promise<
  Result<
    { handlePriceInfo: HandlePriceInfo; handlePriceInfoUtxo: UtxoDescriptor },
    string
  >
> => {
  const handlePriceInfoHandle = await fetchApi(
    `handles/${handlePriceAssetName}`,
  ).then((res) => res.json());
  const raw = await fetchCurrentAssetUtxo(
    `${LEGACY_POLICY_ID}${handlePriceInfoHandle.hex}`,
  );
  if (!raw.output.inline_datum) {
    throw new Error("Handle Price Info Datum Not Found");
  }

  const handlePriceInfoUtxo = makeUtxoDescriptor(raw.tx_id, raw.output);

  const decodedResult = mayFail(() =>
    decodeHandlePriceInfoDatum(handlePriceInfoUtxo.inlineDatumCbor),
  );
  if (!decodedResult.ok) return Err(decodedResult.error);

  return Ok({
    handlePriceInfo: decodedResult.data,
    handlePriceInfoUtxo,
  });
};

// Kept so callers can pre-decode a raw inline-datum CBOR if they need the
// parsed Plutus data directly.
export const decodeInlineDatum = plutusDataFromCbor;

export { fetchHandlePriceInfoData, fetchMintingData, fetchSettings };
