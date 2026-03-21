import {
  makeAddress,
  makeAssetClass,
  makeAssets,
  makeInlineTxOutputDatum,
  makeTxInput,
  makeTxOutput,
  makeValue,
  TxInput,
} from "@helios-lang/ledger";
import { NetworkName } from "@helios-lang/tx-utils";
import { decodeUplcData } from "@helios-lang/uplc";
import { Err, Ok, Result } from "ts-res";

import {
  BLOCKFROST_API_KEY,
  LEGACY_POLICY_ID,
  MINTING_DATA_HANDLE_NAME,
  SETTINGS_HANDLE_NAME,
} from "../constants/index.js";
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
import { fetchApi, getNetwork, mayFail } from "../helpers/index.js";
import { fetch } from "cross-fetch";

const fetchCurrentAssetUtxo = async (assetId: string) => {
  const network = getNetwork(BLOCKFROST_API_KEY);
  const headers = { project_id: BLOCKFROST_API_KEY, "Content-Type": "application/json" };
  const txs = (await fetch(
    `https://cardano-${network}.blockfrost.io/api/v0/assets/${assetId}/transactions?order=desc&count=1`,
    { headers }
  ).then((res) => res.json())) as { tx_hash: string }[];
  const latestTx = txs[0];
  if (!latestTx?.tx_hash) throw new Error("Minting Data UTxO Not Found");

  const txUtxos = (await fetch(
    `https://cardano-${network}.blockfrost.io/api/v0/txs/${latestTx.tx_hash}/utxos`,
    { headers }
  ).then((res) => res.json())) as {
    outputs: {
      output_index: number;
      address: string;
      amount: { unit: string; quantity: string }[];
      inline_datum?: string;
    }[];
  };
  const output = txUtxos.outputs.find((candidate) =>
    candidate.amount.some((amount) => amount.unit === assetId && amount.quantity !== "0")
  );
  if (!output) throw new Error("Minting Data UTxO Not Found");

  return { tx_id: latestTx.tx_hash, output };
};

const makeAssetsFromOutputAmounts = (
  amounts: { unit: string; quantity: string }[]
) =>
  makeAssets(
    amounts
      .filter((amount) => amount.unit !== "lovelace" && BigInt(amount.quantity) > 0n)
      .map((amount) => [
        makeAssetClass(`${amount.unit.slice(0, 56)}.${amount.unit.slice(56)}`),
        BigInt(amount.quantity),
      ])
  );

const fetchSettings = async (
  network: NetworkName
): Promise<
  Result<
    {
      settings: Settings;
      settingsV1: SettingsV1;
      settingsAssetTxInput: TxInput;
    },
    string
  >
> => {
  const settingsHandle = await fetchApi(`handles/${SETTINGS_HANDLE_NAME}`).then(
    (res) => res.json()
  );
  const settingsHandleDatum: string = await fetchApi(
    `handles/${SETTINGS_HANDLE_NAME}/datum`,
    { "Content-Type": "text/plain" }
  ).then((res) => res.text());

  if (!settingsHandleDatum) {
    throw new Error("Settings Datum Not Found");
  }

  const settingsAssetTxInput = makeTxInput(
    settingsHandle.utxo,
    makeTxOutput(
      makeAddress(settingsHandle.resolved_addresses.ada),
      makeValue(
        BigInt(1),
        makeAssets([
          [makeAssetClass(`${LEGACY_POLICY_ID}.${settingsHandle.hex}`), 1n],
        ])
      ),
      makeInlineTxOutputDatum(decodeUplcData(settingsHandleDatum))
    )
  );

  const decodedSettingsResult = mayFail(() =>
    decodeSettingsDatum(settingsAssetTxInput.datum)
  );
  if (!decodedSettingsResult.ok) {
    return Err(decodedSettingsResult.error);
  }

  const decodedSettingsV1Result = mayFail(() =>
    decodeSettingsV1Data(decodedSettingsResult.data.data, network)
  );
  if (!decodedSettingsV1Result.ok) return Err(decodedSettingsV1Result.error);

  return Ok({
    settings: decodedSettingsResult.data,
    settingsV1: decodedSettingsV1Result.data,
    settingsAssetTxInput,
  });
};

const fetchMintingData = async (): Promise<
  Result<{ mintingData: MintingData; mintingDataAssetTxInput: TxInput }, string>
> => {
  const mintingDataHandle = await fetchApi(`handles/${MINTING_DATA_HANDLE_NAME}`).then((res) =>
    res.json()
  );

  const mintingDataUtxo = await fetchCurrentAssetUtxo(
    `${LEGACY_POLICY_ID}${mintingDataHandle.hex}`
  );
  const mintingDataDatum = mintingDataUtxo.output.inline_datum;

  if (!mintingDataDatum) {
    throw new Error("Minting Data Datum Not Found");
  }

  const mintingDataAssetTxInput = makeTxInput(
    `${mintingDataUtxo.tx_id}#${mintingDataUtxo.output.output_index}`,
    makeTxOutput(
      makeAddress(mintingDataUtxo.output.address),
      makeValue(
        BigInt(
          mintingDataUtxo.output.amount.find((amount) => amount.unit === "lovelace")
            ?.quantity || "0"
        ),
        makeAssetsFromOutputAmounts(mintingDataUtxo.output.amount)
      ),
      makeInlineTxOutputDatum(decodeUplcData(mintingDataDatum))
    )
  );

  const decodedMintingDataResult = mayFail(() =>
    decodeMintingDataDatum(mintingDataAssetTxInput.datum)
  );
  if (!decodedMintingDataResult.ok) {
    return Err(decodedMintingDataResult.error);
  }

  return Ok({
    mintingData: decodedMintingDataResult.data,
    mintingDataAssetTxInput,
  });
};

/**
 * Fetch Handle Price Info Data
 * @param handlePriceAssetName - The name of the handle price asset in UTF8
 * @returns The handle price info data
 */
const fetchHandlePriceInfoData = async (
  handlePriceAssetName: string
): Promise<
  Result<
    { handlePriceInfo: HandlePriceInfo; handlePriceInfoAssetTxInput: TxInput },
    string
  >
> => {
  const handlePriceInfoHandle = await fetchApi(
    `handles/${handlePriceAssetName}`
  ).then((res) => res.json());
  const handlePriceInfoUtxo = await fetchCurrentAssetUtxo(
    `${LEGACY_POLICY_ID}${handlePriceInfoHandle.hex}`
  );
  const handlePriceInfoHandleDatum = handlePriceInfoUtxo.output.inline_datum;

  if (!handlePriceInfoHandleDatum) {
    throw new Error("Handle Price Info Datum Not Found");
  }

  const handlePriceInfoAssetTxInput = makeTxInput(
    `${handlePriceInfoUtxo.tx_id}#${handlePriceInfoUtxo.output.output_index}`,
    makeTxOutput(
      makeAddress(handlePriceInfoUtxo.output.address),
      makeValue(
        BigInt(
          handlePriceInfoUtxo.output.amount.find(
            (amount) => amount.unit === "lovelace"
          )?.quantity || "0"
        ),
        makeAssetsFromOutputAmounts(handlePriceInfoUtxo.output.amount)
      ),
      makeInlineTxOutputDatum(decodeUplcData(handlePriceInfoHandleDatum))
    )
  );

  const decodedHandlePriceInfoResult = mayFail(() =>
    decodeHandlePriceInfoDatum(handlePriceInfoAssetTxInput.datum)
  );
  if (!decodedHandlePriceInfoResult.ok) {
    return Err(decodedHandlePriceInfoResult.error);
  }

  return Ok({
    handlePriceInfo: decodedHandlePriceInfoResult.data,
    handlePriceInfoAssetTxInput,
  });
};

export { fetchHandlePriceInfoData, fetchMintingData, fetchSettings };
