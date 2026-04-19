import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import type { Cardano as CardanoTypes } from "@cardano-sdk/core";
import type { Ed25519KeyHashHex } from "@cardano-sdk/crypto";
import { Err, Ok, Result } from "ts-res";

import {
  fetchHandlePriceInfoData,
  fetchMintingData,
  fetchSettings,
} from "../configs/index.js";
import { HANDLE_PRICE_INFO_HANDLE_NAME } from "../constants/index.js";
import {
  buildHandlePriceInfoData,
  buildMintingData,
  buildMintingDataMintNewHandlesRedeemer,
  buildMintV1MintHandlesRedeemer,
  convertHandlePricesToHandlePriceData,
  HandlePriceInfo,
  HandlePrices,
  MintingData,
  MPTProof,
  NewHandle,
  parseMPTProofJSON,
  plutusDataToCbor,
  Settings,
  SettingsV1,
} from "../contracts/index.js";
import { getBlockfrostBuildContext } from "../helpers/cardano-sdk/blockfrostContext.js";
import { Cardano, type HexBlob, Serialization } from "../helpers/cardano-sdk/index.js";
import { getNetwork } from "../helpers/index.js";
import { DeployedScripts, fetchAllDeployedScripts } from "./deploy.js";
import type { TxPlan } from "./txPlan.js";

interface PrepareNewMintParams {
  changeAddress: string;
  /** Payment-key-hash of the minter (required signer). */
  minterKeyHash: string;
  latestHandlePrices: HandlePrices;
  handles: NewHandle[];
  walletUtxos: CardanoTypes.Utxo[];
  collateralUtxo?: CardanoTypes.Utxo;
  db: Trie;
  blockfrostApiKey: string;
}

interface PrepareNewMintDeps {
  fetchAllDeployedScriptsFn?: typeof fetchAllDeployedScripts;
  fetchMintingDataFn?: typeof fetchMintingData;
  fetchSettingsFn?: typeof fetchSettings;
  fetchHandlePriceInfoDataFn?: typeof fetchHandlePriceInfoData;
}

const prepareNewMintTransaction = async (
  params: PrepareNewMintParams,
  {
    fetchAllDeployedScriptsFn = fetchAllDeployedScripts,
    fetchMintingDataFn = fetchMintingData,
    fetchSettingsFn = fetchSettings,
    fetchHandlePriceInfoDataFn = fetchHandlePriceInfoData,
  }: PrepareNewMintDeps = {},
): Promise<
  Result<
    {
      plan: TxPlan;
      deployedScripts: DeployedScripts;
      settings: Settings;
      settingsV1: SettingsV1;
      handlePriceInfo: HandlePriceInfo;
    },
    Error
  >
> => {
  const {
    changeAddress,
    minterKeyHash,
    handles,
    walletUtxos,
    collateralUtxo,
    db,
    blockfrostApiKey,
    latestHandlePrices,
  } = params;
  const network = getNetwork(blockfrostApiKey);

  const fetchedResult = await fetchAllDeployedScriptsFn();
  if (!fetchedResult.ok) {
    return Err(new Error(`Failed to fetch scripts: ${fetchedResult.error}`));
  }
  const {
    mintProxyScript,
    mintingDataScript,
    mintV1Script,
    ordersScript,
  } = fetchedResult.data;

  const settingsResult = await fetchSettingsFn(network);
  if (!settingsResult.ok) {
    return Err(new Error(`Failed to fetch settings: ${settingsResult.error}`));
  }
  const { settings, settingsV1, settingsUtxo } = settingsResult.data;
  const { treasury_address } = settingsV1;

  const mintingDataResult = await fetchMintingDataFn();
  if (!mintingDataResult.ok) {
    return Err(
      new Error(`Failed to fetch minting data: ${mintingDataResult.error}`),
    );
  }
  const { mintingData, mintingDataUtxo } = mintingDataResult.data;

  const handlePriceInfoDataResult = await fetchHandlePriceInfoDataFn(
    HANDLE_PRICE_INFO_HANDLE_NAME,
  );
  if (!handlePriceInfoDataResult.ok) {
    return Err(
      new Error(
        `Failed to fetch handle price info: ${handlePriceInfoDataResult.error}`,
      ),
    );
  }
  const { handlePriceInfo, handlePriceInfoUtxo } =
    handlePriceInfoDataResult.data;

  if (
    mintingData.mpt_root_hash.toLowerCase() !==
    (db.hash?.toString("hex") || Buffer.alloc(32).toString("hex")).toLowerCase()
  ) {
    return Err(new Error("ERROR: Local DB and On Chain Root Hash mismatch"));
  }

  const treasuryFee = handles.reduce((acc, cur) => acc + cur.treasuryFee, 0n);
  const minterFee = handles.reduce((acc, cur) => acc + cur.minterFee, 0n);

  const proofs: MPTProof[] = [];
  for (const handle of handles) {
    const { utf8Name } = handle;
    try {
      await db.insert(utf8Name, "");
      const mpfProof = await db.prove(utf8Name);
      proofs.push(parseMPTProofJSON(mpfProof.toJSON()));
    } catch (e) {
      console.warn("Handle already exists", utf8Name, e);
      return Err(new Error(`Handle "${utf8Name}" already exists`));
    }
  }

  const newMintingData: MintingData = {
    ...mintingData,
    mpt_root_hash: db.hash.toString("hex"),
  };

  const mintingDataCoreUtxo = reconstructUtxo(mintingDataUtxo);
  const handlePriceInfoCoreUtxo = reconstructUtxo(handlePriceInfoUtxo);

  // Output 1: updated minting data back to same address
  const updatedMintingDatum = Serialization.PlutusData.fromCbor(
    plutusDataToCbor(buildMintingData(newMintingData)) as HexBlob,
  ).toCore();
  const mintingDataOutput: CardanoTypes.TxOut = {
    address: mintingDataCoreUtxo[1].address,
    value: mintingDataCoreUtxo[1].value,
    datum: updatedMintingDatum,
  };

  // Output 2: updated handle price info back to same address
  const newHandlePriceInfo: HandlePriceInfo = {
    current_data: convertHandlePricesToHandlePriceData(latestHandlePrices),
    prev_data: handlePriceInfo.prev_data,
    updated_at: BigInt(Date.now()),
  };
  const newHandlePriceInfoDatum = Serialization.PlutusData.fromCbor(
    plutusDataToCbor(buildHandlePriceInfoData(newHandlePriceInfo)) as HexBlob,
  ).toCore();
  const handlePriceInfoOutput: CardanoTypes.TxOut = {
    address: handlePriceInfoCoreUtxo[1].address,
    value: handlePriceInfoCoreUtxo[1].value,
    datum: newHandlePriceInfoDatum,
  };

  // Output 3: treasury fee
  const voidDatum = Serialization.PlutusData.fromCbor(
    plutusDataToCbor({ constructor: 0n, fields: { items: [] } }) as HexBlob,
  ).toCore();
  const treasuryOutput: CardanoTypes.TxOut = {
    address: treasury_address as unknown as CardanoTypes.TxOut["address"],
    value: { coins: treasuryFee },
    datum: voidDatum,
  };

  // Output 4: minter fee
  const minterOutput: CardanoTypes.TxOut = {
    address: changeAddress as unknown as CardanoTypes.TxOut["address"],
    value: { coins: minterFee },
    datum: voidDatum,
  };

  const spendMintingDataRedeemer: CardanoTypes.Redeemer = {
    data: Serialization.PlutusData.fromCbor(
      plutusDataToCbor(
        buildMintingDataMintNewHandlesRedeemer(proofs, 0n),
      ) as HexBlob,
    ).toCore(),
    executionUnits: { memory: 0, steps: 0 },
    index: 0,
    purpose: Cardano.RedeemerPurpose.spend,
  };

  const withdrawMintV1Redeemer: CardanoTypes.Redeemer = {
    data: Serialization.PlutusData.fromCbor(
      plutusDataToCbor(buildMintV1MintHandlesRedeemer()) as HexBlob,
    ).toCore(),
    executionUnits: { memory: 0, steps: 0 },
    index: 0,
    purpose: Cardano.RedeemerPurpose.withdrawal,
  };

  const buildContext = await getBlockfrostBuildContext(network, blockfrostApiKey);

  const referenceInputs = new Set<CardanoTypes.TxIn>([
    {
      txId: Cardano.TransactionId(settingsUtxo.txHash as HexBlob),
      index: settingsUtxo.outputIndex,
    },
    {
      txId: Cardano.TransactionId(mintProxyScript.refScriptUtxo.txHash as HexBlob),
      index: mintProxyScript.refScriptUtxo.outputIndex,
    },
    {
      txId: Cardano.TransactionId(mintV1Script.refScriptUtxo.txHash as HexBlob),
      index: mintV1Script.refScriptUtxo.outputIndex,
    },
    {
      txId: Cardano.TransactionId(mintingDataScript.refScriptUtxo.txHash as HexBlob),
      index: mintingDataScript.refScriptUtxo.outputIndex,
    },
    {
      txId: Cardano.TransactionId(ordersScript.refScriptUtxo.txHash as HexBlob),
      index: ordersScript.refScriptUtxo.outputIndex,
    },
  ]);

  const mintV1StakingCredential = {
    type: Cardano.CredentialType.ScriptHash,
    hash: mintV1Script.details.validatorHash as unknown as CardanoTypes.Credential["hash"],
  };
  // Cardano-sdk exports a reward-account builder at `RewardAddress`, not
  // `RewardAccount`. Build a RewardAddress then project out its bech32
  // which matches the `CardanoTypes.RewardAccount` branded-string type.
  const mintV1RewardAccount =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Cardano as any).RewardAddress.fromCredentials(
      network === "mainnet" ? 1 : 0,
      mintV1StakingCredential,
    )
      .toAddress()
      .toBech32() as CardanoTypes.RewardAccount;
  const withdrawals = new Map<CardanoTypes.RewardAccount, bigint>([
    [mintV1RewardAccount, 0n],
  ]);

  const plan: TxPlan = {
    preSelectedUtxos: [mintingDataCoreUtxo, handlePriceInfoCoreUtxo],
    spareUtxos: walletUtxos,
    outputs: [
      mintingDataOutput,
      handlePriceInfoOutput,
      treasuryOutput,
      minterOutput,
    ],
    referenceInputs,
    redeemers: [spendMintingDataRedeemer, withdrawMintV1Redeemer],
    withdrawals,
    requiredSigners: [minterKeyHash as Ed25519KeyHashHex],
    usedPlutusVersions: [Cardano.PlutusLanguageVersion.V2],
    collateralUtxo,
    changeAddress,
    buildContext,
  };

  return Ok({
    plan,
    deployedScripts: fetchedResult.data,
    settings,
    settingsV1,
    handlePriceInfo,
  });
};

const reconstructUtxo = (
  descriptor: import("../configs/index.js").UtxoDescriptor,
): CardanoTypes.Utxo => {
  const assets = new Map<CardanoTypes.AssetId, bigint>();
  for (const [key, quantity] of descriptor.assets) {
    const [policyId, assetName] = key.split(".");
    const assetId = Cardano.AssetId.fromParts(
      Cardano.PolicyId(policyId as HexBlob),
      Cardano.AssetName(assetName as HexBlob),
    );
    assets.set(assetId, quantity);
  }
  const txIn: CardanoTypes.HydratedTxIn = {
    txId: Cardano.TransactionId(descriptor.txHash as HexBlob),
    index: descriptor.outputIndex,
    address: descriptor.address as CardanoTypes.TxOut["address"],
  };
  const txOut: CardanoTypes.TxOut = {
    address: descriptor.address as CardanoTypes.TxOut["address"],
    value: {
      coins: descriptor.lovelace,
      ...(assets.size > 0 ? { assets } : {}),
    },
    ...(descriptor.inlineDatumCbor
      ? {
          datum: Serialization.PlutusData.fromCbor(
            descriptor.inlineDatumCbor as HexBlob,
          ).toCore(),
        }
      : {}),
  };
  return [txIn, txOut];
};

export type { PrepareNewMintParams };
export { prepareNewMintTransaction };
