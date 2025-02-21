import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import { BlockFrostAPI } from "@blockfrost/blockfrost-js";
import { bytesToHex } from "@helios-lang/codec-utils";
import {
  makeAddress,
  makeAssets,
  makeInlineTxOutputDatum,
  makeTxOutput,
  makeValidatorHash,
  makeValue,
} from "@helios-lang/ledger";
import {
  makeBlockfrostV0Client,
  makeTxBuilder,
  NetworkName,
} from "@helios-lang/tx-utils";
import { Err, Result } from "ts-res";

import { GET_CONFIGS } from "../configs/index.js";
import {
  buildContracts,
  buildMintingData,
  buildSettingsData,
  buildSettingsV1Data,
  makeVoidData,
  MintingData,
  Settings,
  SettingsV1,
} from "../contracts/index.js";
import {
  BuildTxError,
  mayFail,
  mayFailAsync,
  mayFailTransaction,
  TxSuccessResult,
} from "../helpers/index.js";
import {
  checkAccountRegistrationStatus,
  createAlwaysFailUplcProgram,
} from "../utils/index.js";
import { WalletWithoutKey } from "./types.js";

/**
 * @interface
 * @typedef {object} PublishParams
 * @property {NetworkName} network Network
 * @property {WalletWithoutKey} walletWithoutKey Wallet without key, used to build transaction
 * @property {Trie} db MPF Database for all handles
 */
interface PublishParams {
  network: NetworkName;
  walletWithoutKey: WalletWithoutKey;
  db: Trie;
}

/**
 * @description Publish De-Mi contract and prepare for minting
 * @param {PublishParams} params
 * @param {string} blockfrostApiKey Blockfrost API Key
 * @returns {Promise<Result<TxSuccessResult,  Error | BuildTxError>>} Transaction Result
 */
const publish = async (
  params: PublishParams,
  blockfrostApiKey: string
): Promise<Result<TxSuccessResult, Error | BuildTxError>> => {
  const { network, walletWithoutKey, db } = params;
  const configsResult = mayFail(() => GET_CONFIGS(network));
  if (!configsResult.ok) return Err(new Error(configsResult.error));
  const {
    SETTINGS_ASSET_CLASS,
    MINTING_DATA_ASSET_CLASS,
    ALLOWED_MINTERS,
    TREASURY_ADDRESS,
    TREASURY_FEE,
    MINTER_FEE,
  } = configsResult.data;

  const { address, utxos, collateralUtxo } = walletWithoutKey;
  if (address.era == "Byron")
    return Err(new Error("Byron Address not supported"));
  const isMainnet = network == "mainnet";

  const blockfrostV0Client = makeBlockfrostV0Client(network, blockfrostApiKey);// 2
  const blockfrostApi = new BlockFrostAPI({ projectId: blockfrostApiKey });
  const networkParams = await blockfrostV0Client.parameters;

  const contractsConfig = buildContracts({
    network,
  });
  const { mintV1: mintV1Config } = contractsConfig;

  // we already have settings asset using legacy handle.
  const settingsV1: SettingsV1 = {
    policy_id: contractsConfig.handlePolicyHash.toHex(),
    allowed_minters: ALLOWED_MINTERS,
    treasury_address: TREASURY_ADDRESS,
    treasury_fee: TREASURY_FEE,
    minter_fee: MINTER_FEE,
  };
  const settings: Settings = {
    mint_governor: mintV1Config.mintV1ValiatorHash.toHex(),
    data: buildSettingsV1Data(settingsV1),
  };

  // we already have minting data asset using legacy handle.
  const mintingData: MintingData = {
    mpt_root_hash: db.hash.toString("hex"),
  };

  // fetch settings asset UTxO
  const settingsAssetUtxoResult = await mayFailAsync(
    async () =>
      (
        await blockfrostV0Client.getUtxosWithAssetClass(
          address,
          SETTINGS_ASSET_CLASS
        )
      )[0]
  ).complete();
  if (!settingsAssetUtxoResult.ok)
    return Err(
      new Error(
        `Failed to fetch Settings Asset: ${settingsAssetUtxoResult.error}`
      )
    );
  const settingsAssetUtxo = settingsAssetUtxoResult.data;

  // fetch minting data asset UTxO
  const mintingDataAssetUtxoResult = await mayFailAsync(
    async () =>
      (
        await blockfrostV0Client.getUtxosWithAssetClass(
          address,
          MINTING_DATA_ASSET_CLASS
        )
      )[0]
  ).complete();
  if (!mintingDataAssetUtxoResult.ok)
    return Err(
      new Error(
        `Failed to fetch Minting Data Asset: ${mintingDataAssetUtxoResult.error}`
      )
    );
  const mintingDataAssetUtxo = mintingDataAssetUtxoResult.data;

  const settingsValue = makeValue(
    5_000_000n,
    makeAssets([[SETTINGS_ASSET_CLASS, 1n]])
  );
  const mintingDataValue = makeValue(
    5_000_000n,
    makeAssets([[MINTING_DATA_ASSET_CLASS, 1n]])
  );

  // remove settings asset utxo and minting data asset utxo from utxos
  const spareUtxos = utxos.filter(
    (utxo) =>
      utxo.id.toString() != settingsAssetUtxo.id.toString() &&
      utxo.id.toString() != mintingDataAssetUtxo.id.toString()
  );

  const alwaysFailUplcProgram = createAlwaysFailUplcProgram();
  const alwaysFailUplcProgramAddress = makeAddress(
    isMainnet,
    makeValidatorHash(alwaysFailUplcProgram.hash())
  );

  // start building tx
  const txBuilder = makeTxBuilder({
    isMainnet,
  });

  // <-- spend settings asset utxo
  txBuilder.spendUnsafe(settingsAssetUtxo);

  // <-- pay settings asset with init Settings Datum
  txBuilder.payUnsafe(
    address,
    settingsValue,
    makeInlineTxOutputDatum(buildSettingsData(settings))
  );

  // <-- spend minting data asset utxo (if it is not same as settings asset utxo)
  txBuilder.spendUnsafe(mintingDataAssetUtxo);

  // <-- pay minting data asset with init Minting Data Datum
  txBuilder.payUnsafe(
    address,
    mintingDataValue,
    makeInlineTxOutputDatum(buildMintingData(mintingData))
  );

  // <-- lock reference script (mint v1) to always fail uplc program
  const referenceOutput = makeTxOutput(
    alwaysFailUplcProgramAddress,
    makeValue(2_000_000n),
    makeInlineTxOutputDatum(makeVoidData()),
    mintV1Config.mintV1WithdrawUplcProgram
  );
  referenceOutput.correctLovelace(networkParams);
  txBuilder.addOutput(referenceOutput);

  // <-- register mint v1 staking address
  // after check staking address is already registered or not
  const mintV1StakingAddressRegistered =
    (await checkAccountRegistrationStatus(
      blockfrostApi,
      mintV1Config.mintV1StakingAddress.toBech32()
    )) == "registered";
  if (!mintV1StakingAddressRegistered)
    txBuilder.addDCert(mintV1Config.mintV1RegistrationDCert);

  // <-- use collateral
  if (collateralUtxo) txBuilder.addCollateral(collateralUtxo);

  const txResult = await mayFailTransaction(
    txBuilder,
    address,
    spareUtxos
  ).complete();
  if (txResult.ok) {
    console.log("!!NOTE!!");
    console.log(
      "Save this TxOutputId. This is where Mint V1 Ref Script is attached"
    );
    console.log(`${bytesToHex(txResult.data.tx.body.hash())}#1`);
  }
  return txResult;
};

export type { PublishParams };
export { publish };
