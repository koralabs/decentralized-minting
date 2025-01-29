import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import { BlockFrostAPI } from "@blockfrost/blockfrost-js";
import { bytesToHex } from "@helios-lang/codec-utils";
import {
  makeAssets,
  makeInlineTxOutputDatum,
  makeTxOutput,
  makeValue,
} from "@helios-lang/ledger";
import {
  makeBlockfrostV0Client,
  makeTxBuilder,
  NetworkName,
} from "@helios-lang/tx-utils";
import { GET_CONFIGS } from "configs/index.js";
import { Err, Result } from "ts-res";

import {
  buildContracts,
  buildSettingsData,
  buildSettingsV1Data,
  makeVoidData,
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
import { checkAccountRegistrationStatus } from "../utils/index.js";
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
    ALLOWED_MINTERS,
    INITIAL_TX_OUTPUT_ID,
    MINTER_FEE,
    TREASURY_ADDRESS,
    TREASURY_FEE,
  } = configsResult.data;

  const { address, utxos, collateralUtxo } = walletWithoutKey;
  if (address.era == "Byron")
    return Err(new Error("Byron Address not supported"));
  const isMainnet = network == "mainnet";

  const blockfrostV0Client = makeBlockfrostV0Client(network, blockfrostApiKey);
  const blockfrostApi = new BlockFrostAPI({ projectId: blockfrostApiKey });
  const networkParams = await blockfrostV0Client.parameters;
  const initialUtxoResult = await mayFailAsync(() =>
    blockfrostV0Client.getUtxo(INITIAL_TX_OUTPUT_ID)
  ).complete();
  if (!initialUtxoResult.ok) return Err(new Error("Initial UTxO not found"));
  const initialUtxo = initialUtxoResult.data;

  // check initialUtxo can be spent by addesss
  if (initialUtxo.address.toString() != address.toString())
    return Err(new Error(`Initial UTxO must be under Address ${address}`));
  const spareUtxos = utxos.filter(
    (utxo) => utxo.id.toString() != INITIAL_TX_OUTPUT_ID.toString()
  );

  const contractsConfig = buildContracts({
    network,
  });
  const {
    settingsProxy: settingsProxyConfig,
    settingsV1: settingsV1Config,
    mintV1: mintV1Config,
  } = contractsConfig;

  const settingsV1: SettingsV1 = {
    all_handles: db.hash.toString("hex"),
    allowed_minters: ALLOWED_MINTERS,
    minter_fee: MINTER_FEE,
    treasury_fee: TREASURY_FEE,
    policy_id: contractsConfig.handlePolicyHash.toHex(),
    treasury_address: TREASURY_ADDRESS,
  };
  const settings: Settings = {
    mint_governor: mintV1Config.mintV1ValiatorHash.toHex(),
    settings_governor: settingsV1Config.settingsV1ValidatorHash.toHex(),
    data: buildSettingsV1Data(settingsV1),
  };

  const settingsValue = makeValue(
    5_000_000n,
    makeAssets([[settingsProxyConfig.settingsProxyAssetClass, 1n]])
  );

  // start building tx
  const txBuilder = makeTxBuilder({
    isMainnet,
  });

  // <-- spend initial utxo
  txBuilder.spendUnsafe(initialUtxo);

  // <-- attach settings proxy mint validator
  txBuilder.attachUplcProgram(settingsProxyConfig.settingsProxyMintUplcProgram);

  // <-- mint settings asset
  txBuilder.mintAssetClassUnsafe(
    settingsProxyConfig.settingsProxyAssetClass,
    1n,
    makeVoidData()
  );

  // <-- lock settings value
  txBuilder.payUnsafe(
    settingsProxyConfig.settingsProxyScriptAddress,
    settingsValue,
    makeInlineTxOutputDatum(buildSettingsData(settings))
  );

  // <-- lock reference script (mint v1)
  const referenceOutput = makeTxOutput(
    settingsProxyConfig.settingsProxyScriptAddress,
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

  // <-- register settings v1 staking address
  // after check staking address is already registered or not
  const settingsV1StakingAddressRegistered =
    (await checkAccountRegistrationStatus(
      blockfrostApi,
      settingsV1Config.settingsV1StakingAddress.toBech32()
    )) == "registered";
  if (!settingsV1StakingAddressRegistered)
    txBuilder.addDCert(settingsV1Config.settingsV1RegistrationDCert);

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
