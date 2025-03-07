import {
  makeAssetClass,
  makeAssets,
  makeDummyAddress,
  makeInlineTxOutputDatum,
  makeMintingPolicyHash,
  makeTxOutput,
  makeTxOutputId,
  makeValidatorHash,
  makeValue,
  TxInput,
} from "@helios-lang/ledger";
import {
  BlockfrostV0Client,
  Emulator,
  makeEmulator,
  makeTxBuilder,
  NetworkName,
  SimpleWallet,
} from "@helios-lang/tx-utils";
import { decodeUplcProgramV2FromCbor, UplcProgramV2 } from "@helios-lang/uplc";
import { ScriptDetails, ScriptType } from "@koralabs/kora-labs-common";
import fs from "fs/promises";
import { Ok } from "ts-res";
import { test, vi } from "vitest";

import {
  buildContracts,
  buildMintingData,
  buildSettingsData,
  buildSettingsV1Data,
  DeployedScripts,
  init,
  MintingData,
  Settings,
  SettingsV1,
} from "../src/index.js";
import {
  alwaysSuceedMintUplcProgram,
  extractScriptCborsFromUplcProgram,
} from "./utils.js";

const network: NetworkName = "preprod";
const isMainnet = false;
const ACCOUNT_LOVELACE = 5_000_000_000n;
const MIN_LOVELACE = 5_000_000n;

const dbPath = "./tests/test-db";

const settingsAssetClass = makeAssetClass(
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de14064656d694068616e646c655f73657474696e6773"
);
const mintingDataAssetClass = makeAssetClass(
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de14068616e646c65735f726f6f744068616e646c655f73657474696e6773"
);

const treasuryFee = 2_000_000n;
const minterFee = 2_000_000n;

const deployScript = async (
  scriptType: ScriptType,
  emulator: Emulator,
  wallet: SimpleWallet,
  cbor: string,
  unoptimizedCbor: string
): Promise<[ScriptDetails, TxInput]> => {
  const txBuilder = makeTxBuilder({ isMainnet });
  const uplcProgram = decodeUplcProgramV2FromCbor(cbor);
  const output = makeTxOutput(
    makeDummyAddress(isMainnet),
    makeValue(1n),
    undefined,
    uplcProgram
  );
  output.correctLovelace(emulator.parametersSync);
  txBuilder.addOutput(output);
  const tx = await txBuilder.build({
    changeAddress: wallet.address,
    spareUtxos: await wallet.utxos,
  });
  tx.addSignatures(await wallet.signTx(tx));
  const txId = await wallet.submitTx(tx);
  emulator.tick(200);

  const refTxInput = await emulator.getUtxo(makeTxOutputId(txId, 0));
  refTxInput.output.refScript = (
    refTxInput.output.refScript! as UplcProgramV2
  ).withAlt(decodeUplcProgramV2FromCbor(unoptimizedCbor));
  const scriptDetails: ScriptDetails = {
    handle: "",
    handleHex: "",
    type: scriptType,
    validatorHash: makeValidatorHash(uplcProgram.hash()).toHex(),
    refScriptUtxo: `${txId.toHex()}#0`,
  };

  return [scriptDetails, refTxInput];
};

const setup = async () => {
  const emulator = makeEmulator();

  // legacy handles policy id
  const legacyMintUplcProgram = alwaysSuceedMintUplcProgram();
  // policy id: f060f0ef7fa4c3c6d3a4f831c639038db0f625c548a711f2b276a282
  const legacyPolicyId = makeMintingPolicyHash(
    legacyMintUplcProgram.hash()
  ).toHex();

  // ============ prepare wallets ============
  // fund wallet
  const fundWallet = emulator.createWallet(
    ACCOUNT_LOVELACE,
    makeAssets([
      [settingsAssetClass, 1n],
      [mintingDataAssetClass, 1n],
    ])
  );
  emulator.tick(200);
  // admin wallet will keep settings asset
  const adminWallet = emulator.createWallet(ACCOUNT_LOVELACE);
  emulator.tick(200);
  // allowed minters wallets
  const allowedMintersWallets: SimpleWallet[] = [];
  for (let i = 0; i < 2; i++) {
    allowedMintersWallets.push(emulator.createWallet(ACCOUNT_LOVELACE));
    emulator.tick(200);
  }
  const allowedMintersPubKeyHashes: string[] = allowedMintersWallets.map(
    (wallet) => wallet.spendingPubKeyHash.toHex()
  );
  // god wallet will be used to fix mpt root hash
  const godWallet = emulator.createWallet(ACCOUNT_LOVELACE);
  emulator.tick(200);
  // pz script wallet
  const pzWallet = emulator.createWallet(ACCOUNT_LOVELACE);
  emulator.tick(200);
  // treasury wallet
  const treasuryWallet = emulator.createWallet(ACCOUNT_LOVELACE);
  emulator.tick(200);
  // users wallet
  const usersWallets: SimpleWallet[] = [];
  for (let i = 0; i < 5; i++) {
    usersWallets.push(emulator.createWallet(ACCOUNT_LOVELACE));
    emulator.tick(200);
  }

  // ============ build merkle trie db ============
  await fs.rm(dbPath, { recursive: true, force: true });
  const db = await init(dbPath);

  // ============ build contracts ============
  const mintVersion = 0n;
  const godPubKeyHash = godWallet.spendingPubKeyHash.toHex();
  const contractsConfig = buildContracts({
    network,
    mint_version: mintVersion,
    legacy_policy_id: legacyPolicyId,
    god_verification_key_hash: godPubKeyHash,
  });
  const {
    handlePolicyHash,
    mintProxy: mintProxyConfig,
    mintV1: mintV1Config,
    mintingData: mintingDataConfig,
    orders: ordersConfig,
  } = contractsConfig;

  // ============ prepare settings data ============
  const settingsV1: SettingsV1 = {
    policy_id: handlePolicyHash.toHex(),
    allowed_minters: allowedMintersPubKeyHashes,
    treasury_address: treasuryWallet.address,
    treasury_fee: treasuryFee,
    minter_fee: minterFee,
    pz_script_address: pzWallet.address,
    order_script_hash: ordersConfig.ordersValidatorHash.toHex(),
    minting_data_script_hash:
      mintingDataConfig.mintingDataValidatorHash.toHex(),
  };
  const settings: Settings = {
    mint_governor: mintV1Config.mintV1ValiatorHash.toHex(),
    mint_version: mintVersion,
    data: buildSettingsV1Data(settingsV1),
  };

  // ============ prepare minting data ============
  const mintingData: MintingData = {
    mpt_root_hash: db.hash?.toString("hex") || Buffer.alloc(32).toString("hex"),
  };

  // ============ prepare settings and minting data asset ============
  const prepareAssetsTxBuilder = makeTxBuilder({ isMainnet });
  const fundWalletUTxOs = await fundWallet.utxos;
  prepareAssetsTxBuilder.spendUnsafe(fundWalletUTxOs);
  prepareAssetsTxBuilder.payUnsafe(
    adminWallet.address,
    makeValue(MIN_LOVELACE, makeAssets([[settingsAssetClass, 1n]])),
    makeInlineTxOutputDatum(buildSettingsData(settings))
  );
  prepareAssetsTxBuilder.payUnsafe(
    mintingDataConfig.mintingDataValidatorAddress,
    makeValue(MIN_LOVELACE, makeAssets([[mintingDataAssetClass, 1n]])),
    makeInlineTxOutputDatum(buildMintingData(mintingData))
  );
  const prepareAssetsTx = await prepareAssetsTxBuilder.build({
    changeAddress: fundWallet.address,
  });
  prepareAssetsTx.addSignatures(await fundWallet.signTx(prepareAssetsTx));
  const prepareAssetsTxId = await fundWallet.submitTx(prepareAssetsTx);
  emulator.tick(200);
  const settingsAssetTxInput = await emulator.getUtxo(
    makeTxOutputId(prepareAssetsTxId, 0)
  );
  const mintingDataAssetTxInput = await emulator.getUtxo(
    makeTxOutputId(prepareAssetsTxId, 1)
  );

  // ============ Deploy Scripts ============
  const [mintProxyScriptDetails, mintProxyScriptTxInput] = await deployScript(
    ScriptType.DEMI_MINT_PROXY,
    emulator,
    pzWallet,
    ...extractScriptCborsFromUplcProgram(
      mintProxyConfig.mintProxyMintUplcProgram
    )
  );
  const [mintV1ScriptDetails, mintV1ScriptTxInput] = await deployScript(
    ScriptType.DEMI_MINT,
    emulator,
    pzWallet,
    ...extractScriptCborsFromUplcProgram(mintV1Config.mintV1WithdrawUplcProgram)
  );
  const [mintingDataScriptDetails, mintingDataScriptTxInput] =
    await deployScript(
      ScriptType.DEMI_MINTING_DATA,
      emulator,
      pzWallet,
      ...extractScriptCborsFromUplcProgram(
        mintingDataConfig.mintingDataSpendUplcProgram
      )
    );
  const [ordersScriptDetails, ordersScriptTxInput] = await deployScript(
    ScriptType.DEMI_ORDERS,
    emulator,
    pzWallet,
    ...extractScriptCborsFromUplcProgram(ordersConfig.ordersSpendUplcProgram)
  );

  // ============ mock modules ============
  // mock constants
  vi.doMock("../src/constants/index.js", async (importOriginal) => {
    const defaultValues = await importOriginal<
      typeof import("../src/constants/index.js")
    >();
    return {
      ...defaultValues,
      LEGACY_POLICY_ID: legacyPolicyId,
    };
  });

  // hoist mocked functions
  const {
    mockedFetchDeployedScript,
    mockedFetchAllDeployedScripts,
    mockedFetchSettings,
    mockedFetchMintingData,
    mockedGetBlockfrostV0Client,
    mockedGetNetwork,
  } = vi.hoisted(() => {
    return {
      mockedFetchDeployedScript: vi.fn(),
      mockedFetchAllDeployedScripts: vi.fn(),
      mockedFetchSettings: vi.fn(),
      mockedFetchMintingData: vi.fn(),
      mockedGetBlockfrostV0Client: vi.fn(),
      mockedGetNetwork: vi.fn(),
    };
  });

  // mock getBlockfrostV0Client
  vi.mock("../src/helpers/blockfrost/client.ts", () => {
    return {
      getBlockfrostV0Client: mockedGetBlockfrostV0Client,
    };
  });
  mockedGetBlockfrostV0Client.mockReturnValue(
    new Promise((resolve) => resolve(emulator as unknown as BlockfrostV0Client))
  );

  // mock getNetwork
  vi.mock("../src/helpers/blockfrost/network.ts", () => {
    return { getNetwork: mockedGetNetwork };
  });
  mockedGetNetwork.mockReturnValue(network);

  // mock fetchDeployedScript
  // only use in orders
  vi.mock("../src/utils/contract.ts", () => {
    return { fetchDeployedScript: mockedFetchDeployedScript };
  });
  mockedFetchDeployedScript.mockReturnValue(
    new Promise((resolve) =>
      resolve({
        validatorHash: ordersConfig.ordersValidatorHash.toHex(),
      } as ScriptDetails)
    )
  );

  // mock fetchAllDeployedScripts
  vi.mock("../src/txs/deploy.ts", () => {
    return { fetchAllDeployedScripts: mockedFetchAllDeployedScripts };
  });
  mockedFetchAllDeployedScripts.mockReturnValue(
    new Promise((resolve) =>
      resolve(
        Ok({
          mintProxyScriptDetails,
          mintProxyScriptTxInput,
          mintV1ScriptDetails,
          mintV1ScriptTxInput,
          mintingDataScriptDetails,
          mintingDataScriptTxInput,
          ordersScriptDetails,
          ordersScriptTxInput,
        } as DeployedScripts)
      )
    )
  );

  // mock fetchSettings and fetchMintingData
  vi.mock("../src/configs/index.js", () => {
    return {
      fetchMintingData: mockedFetchMintingData,
      fetchSettings: mockedFetchSettings,
    };
  });
  mockedFetchMintingData.mockReturnValue(
    new Promise((resolve) =>
      resolve(
        Ok({
          mintingData,
          mintingDataAssetTxInput,
        })
      )
    )
  );
  mockedFetchSettings.mockReturnValue(
    new Promise((resolve) =>
      resolve(Ok({ settings, settingsV1: settingsV1, settingsAssetTxInput }))
    )
  );

  const ordersDetail: Array<{ handleName: string; txInput: TxInput }> = [];

  return {
    network,
    emulator,
    db,
    contractsConfig,
    allowedMintersPubKeyHashes,
    legacyMintUplcProgram,
    legacyPolicyId,
    mockedFunctions: {
      mockedFetchDeployedScript,
      mockedFetchAllDeployedScripts,
      mockedFetchSettings,
      mockedFetchMintingData,
      mockedGetBlockfrostV0Client,
      mockedGetNetwork,
    },
    wallets: {
      fundWallet,
      adminWallet,
      allowedMintersWallets,
      godWallet,
      pzWallet,
      treasuryWallet,
      usersWallets,
    },
    ordersDetail,
  };
};

const myTest = test.extend(await setup());

export { myTest };
