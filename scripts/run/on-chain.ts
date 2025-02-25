import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import { bytesToHex } from "@helios-lang/codec-utils";
import { makeAddress } from "@helios-lang/ledger";
import { NetworkName } from "@helios-lang/tx-utils";
import fs from "fs/promises";
import prompts from "prompts";

import {
  BLOCKFROST_API_KEY,
  CONTRACT_NAMES,
  NETWORK,
} from "../../src/constants/index.js";
import {
  buildContracts,
  buildMintingData,
  buildSettingsData,
  buildSettingsV1Data,
  deploy,
  fetchDeployedScript,
  fetchOrdersTxInputs,
  getBlockfrostV0Client,
  invariant,
  mayFailTransaction,
  mint,
  MintingData,
  request,
  Settings,
  SettingsV1,
  TxSuccessResult,
} from "../../src/index.js";
import { GET_CONFIGS } from "../configs/index.js";
import { CommandImpl } from "./types.js";

const doOnChainActions = async (commandImpl: CommandImpl) => {
  const blockfrostV0Client = getBlockfrostV0Client(BLOCKFROST_API_KEY);
  const configs = GET_CONFIGS(NETWORK as NetworkName);
  const {
    SETTINGS_ASSET_CLASS,
    SETTINGS_ASSET_TX_OUTPUT_ID,
    MINTING_DATA_ASSET_CLASS,
    MINTING_DATA_ASSET_TX_OUTPUT_ID,
  } = configs;

  let finished: boolean = false;
  while (!finished) {
    const onChainAction = await prompts({
      message: "Pick an action",
      type: "select",
      name: "action",
      choices: [
        {
          title: "deploy",
          description: "Deploy De-Mi Contracts",
          value: async () => {
            await doDeployActions();
          },
        },
        {
          title: "settings",
          description: "Build Settings Datum CBOR",
          value: async () => {
            const settingsCbor = buildSettingsDataCbor();
            console.log("\n\n------- Settings CBOR -------\n");
            console.log(settingsCbor);
            console.log("\n");
          },
        },
        {
          title: "minting-data",
          description: "Build Minting Data Datum CBOR",
          value: async () => {
            const mintingDataCbor = buildMintingDataCbor(commandImpl.mpt!);
            console.log(
              "\n\n------- Lock This Minting Data CBOR with asset -------\n"
            );
            console.log(mintingDataCbor.cbor);
            console.log("\n");
            console.log("\n------- To This address -------\n");
            console.log(mintingDataCbor.lockAddress.toString());
            console.log("\n");
          },
          disabled: !commandImpl.mpt,
        },
        {
          title: "request",
          description:
            "Request a new ADA handle by placing an order transaction on chain",
          value: async () => {
            const { handle, address } = await prompts([
              {
                name: "handle",
                type: "text",
                message: "The handle you want to request",
              },
              {
                name: "address",
                type: "text",
                message: "User Address to request an order",
              },
            ]);

            const txBuilderResult = await request({
              network: NETWORK as NetworkName,
              handle,
              address: makeAddress(address),
              blockfrostApiKey: BLOCKFROST_API_KEY,
              settingsAssetClass: SETTINGS_ASSET_CLASS,
              settingsAssetTxOutputId: SETTINGS_ASSET_TX_OUTPUT_ID,
            });
            if (txBuilderResult.ok) {
              const txResult = await mayFailTransaction(
                txBuilderResult.data,
                address,
                await blockfrostV0Client.getUtxos(address)
              ).complete();
              if (txResult.ok) {
                await handleTxResult(txResult.data);
              } else {
                console.error("\nFailed to make Transaction\n");
                console.error(txResult.error);
                console.error("\n");
              }
            } else {
              console.error("\nFailed to build Transaction\n");
              console.error(txBuilderResult.error);
              console.error("\n");
            }
          },
          disabled: !commandImpl.mpt,
        },
        {
          title: "mint",
          description: "Mint all new handles with a transaction on-chain",
          value: async () => {
            const ordersScriptDetail = await fetchDeployedScript(
              NETWORK as NetworkName,
              "orders.spend"
            );
            const ordersTxInputsResult = await fetchOrdersTxInputs({
              network: NETWORK as NetworkName,
              ordersScriptDetail,
              blockfrostApiKey: BLOCKFROST_API_KEY,
            });
            invariant(ordersTxInputsResult.ok, "Failed to fetch orders");
            const { address } = await prompts({
              name: "address",
              type: "text",
              message: "Address to perform minting all ordered handles",
            });
            const txBuilderResult = await mint({
              address: makeAddress(address),
              ordersTxInputs: ordersTxInputsResult.data,
              dbFolderPath: commandImpl.storePath,
              settingsAssetClass: SETTINGS_ASSET_CLASS,
              settingsAssetTxOutputId: SETTINGS_ASSET_TX_OUTPUT_ID,
              mintingDataAssetClass: MINTING_DATA_ASSET_CLASS,
              mintingDataAssetTxOutputId: MINTING_DATA_ASSET_TX_OUTPUT_ID,
              blockfrostApiKey: BLOCKFROST_API_KEY,
            });
            if (txBuilderResult.ok) {
              const txResult = await mayFailTransaction(
                txBuilderResult.data,
                address,
                await blockfrostV0Client.getUtxos(address)
              ).complete();
              if (txResult.ok) {
                await handleTxResult(txResult.data);
              } else {
                console.error("\nFailed to make Transaction\n");
                console.error(txResult.error);
                console.error("\n");
              }
            } else {
              console.error("\nFailed to build Transaction\n");
              console.error(txBuilderResult.error);
              console.error("\n");
            }
          },
        },
        {
          title: "back",
          description: "Back to main actions",
          value: () => {
            finished = true;
          },
        },
      ],
    });
    await onChainAction.action();
  }
};

const buildSettingsDataCbor = () => {
  const configs = GET_CONFIGS(NETWORK as NetworkName);
  const {
    MINT_VERSION,
    GOD_VERIFICATION_KEY_HASH,
    ALLOWED_MINTERS,
    TREASURY_ADDRESS,
    PZ_SCRIPT_ADDRESS,
    TREASURY_FEE,
    MINTER_FEE,
  } = configs;

  const contractsConfig = buildContracts({
    network: NETWORK as NetworkName,
    mint_version: MINT_VERSION,
    god_verification_key_hash: GOD_VERIFICATION_KEY_HASH,
  });
  const {
    mintV1: mintV1Config,
    orders: ordersConfig,
    mintingDataProxy: mintingDataConfig,
  } = contractsConfig;

  // we already have settings asset using legacy handle.
  const settingsV1: SettingsV1 = {
    policy_id: contractsConfig.handlePolicyHash.toHex(),
    allowed_minters: ALLOWED_MINTERS,
    treasury_address: TREASURY_ADDRESS,
    treasury_fee: TREASURY_FEE,
    minter_fee: MINTER_FEE,
    pz_script_address: PZ_SCRIPT_ADDRESS,
    order_script_hash: ordersConfig.ordersValidatorHash.toHex(),
    minting_data_script_hash:
      mintingDataConfig.mintingDataProxyValidatorHash.toHex(),
  };
  const settings: Settings = {
    mint_governor: mintV1Config.mintV1ValiatorHash.toHex(),
    mint_version: MINT_VERSION,
    data: buildSettingsV1Data(settingsV1),
  };

  return bytesToHex(buildSettingsData(settings).toCbor());
};

const buildMintingDataCbor = (db: Trie) => {
  const configs = GET_CONFIGS(NETWORK as NetworkName);
  const { MINT_VERSION, GOD_VERIFICATION_KEY_HASH } = configs;

  const contractsConfig = buildContracts({
    network: NETWORK as NetworkName,
    mint_version: MINT_VERSION,
    god_verification_key_hash: GOD_VERIFICATION_KEY_HASH,
  });
  const { mintingDataProxy: mintingDataProxyConfig } = contractsConfig;

  // we already have settings asset using legacy handle.
  const mintingData: MintingData = {
    mpt_root_hash: db.hash.toString("hex"),
  };

  return {
    cbor: bytesToHex(buildMintingData(mintingData).toCbor()),
    lockAddress: mintingDataProxyConfig.mintingDataProxyValidatorAddress,
  };
};

const doDeployActions = async () => {
  const configs = GET_CONFIGS(NETWORK as NetworkName);
  const { MINT_VERSION, GOD_VERIFICATION_KEY_HASH } = configs;

  let finished: boolean = false;
  while (!finished) {
    const deployAction = await prompts({
      message: "Select Contract to Deploy",
      type: "select",
      name: "action",
      choices: [
        ...CONTRACT_NAMES.map((contract) => ({
          title: contract,
          description: contract,
          value: async () => {
            const deployData = await deploy({
              network: NETWORK as NetworkName,
              contractName: contract,
              mintVersion: MINT_VERSION,
              godVerificationKeyHash: GOD_VERIFICATION_KEY_HASH,
            });
            const { filepath } = await prompts({
              name: "filepath",
              type: "text",
              message: "File Path to save data",
            });
            await fs.writeFile(filepath, JSON.stringify(deployData));
          },
        })),
        {
          title: "back",
          description: "Back to On Chain Actions",
          value: () => {
            finished = true;
          },
        },
      ],
    });
    await deployAction.action();
  }
};

const handleTxResult = async (txResult: TxSuccessResult) => {
  const { filepath } = await prompts({
    name: "filepath",
    type: "text",
    message: "File Path to save Tx CBOR and dump",
  });
  await fs.writeFile(
    filepath,
    JSON.stringify({
      cbor: bytesToHex(txResult.tx.toCbor()),
      dump: txResult.dump,
    })
  );
};

export { doOnChainActions };
