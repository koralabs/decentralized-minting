import { Address, AssetClass, TxInput, TxOutputId } from "@helios-lang/ledger";
import { Err, Ok, Result } from "ts-res";

import {
  decodeMintingDataDatum,
  decodeSettingsDatum,
  decodeSettingsV1Data,
  MintingData,
  Settings,
  SettingsV1,
} from "../contracts/index.js";
import {
  getBlockfrostV0Client,
  getNetwork,
  mayFail,
  mayFailAsync,
} from "../helpers/index.js";

const fetchSettings = async (
  settingsAssetClass: AssetClass,
  settingsAssetTxOutputId: TxOutputId,
  blockfrostApiKey: string
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
  const network = getNetwork(blockfrostApiKey);
  const blockfrostV0Client = getBlockfrostV0Client(blockfrostApiKey);
  const settingsAssetUTxOResult = await mayFailAsync(() =>
    blockfrostV0Client.getUtxo(settingsAssetTxOutputId)
  ).complete();
  if (!settingsAssetUTxOResult.ok)
    return Err(
      `Failed to fetch settings asset UTxO: ${settingsAssetUTxOResult.error}`
    );
  const settingsAssetUTxO = settingsAssetUTxOResult.data;

  // check if settings asset UTxO has settings asset
  if (
    !settingsAssetUTxO.value.assets.assetClasses.some(
      (item) => item.toString() == settingsAssetClass.toString()
    )
  ) {
    return Err("Settings Asset Not Found in UTxO");
  }

  const datum = settingsAssetUTxO.datum;
  const decodedSettingsResult = mayFail(() => decodeSettingsDatum(datum));
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
    settingsAssetTxInput: settingsAssetUTxO,
  });
};

const fetchMintingData = async (
  mintingDataAssetClass: AssetClass,
  mintingDataProxyAddress: Address,
  blockfrostApiKey: string
): Promise<
  Result<{ mintingData: MintingData; mintingDataTxInput: TxInput }, string>
> => {
  const blockfrostV0Client = getBlockfrostV0Client(blockfrostApiKey);
  const mintingDataAssetUTxOResult = await mayFailAsync(
    async () =>
      (
        await blockfrostV0Client.getUtxosWithAssetClass(
          mintingDataProxyAddress,
          mintingDataAssetClass
        )
      )[0]!
  ).complete();
  if (!mintingDataAssetUTxOResult.ok)
    return Err(
      `Failed to fetch mintingData asset UTxO: ${mintingDataAssetUTxOResult.error}`
    );
  const mintingDataAssetUTxO = mintingDataAssetUTxOResult.data;

  // check if mintingData asset UTxO has mintingData asset
  if (
    !mintingDataAssetUTxO.value.assets.assetClasses.some(
      (item) => item.toString() == mintingDataAssetClass.toString()
    )
  ) {
    return Err("Settings Asset Not Found in UTxO");
  }

  const datum = mintingDataAssetUTxO.datum;
  const decodedSettingsResult = mayFail(() => decodeMintingDataDatum(datum));
  if (!decodedSettingsResult.ok) {
    return Err(decodedSettingsResult.error);
  }

  return Ok({
    mintingData: decodedSettingsResult.data,
    mintingDataTxInput: mintingDataAssetUTxO,
  });
};

export { fetchMintingData, fetchSettings };
