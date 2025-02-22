import { Store, Trie } from "@aiken-lang/merkle-patricia-forestry";
import {
  Address,
  makeAssets,
  makeInlineTxOutputDatum,
  makePubKeyHash,
  makeValue,
} from "@helios-lang/ledger";
import {
  makeBlockfrostV0Client,
  makeTxBuilder,
  NetworkName,
  TxBuilder,
} from "@helios-lang/tx-utils";
import { Err, Ok, Result } from "ts-res";

import { GET_CONFIGS } from "../configs/index.js";
import {
  buildContracts,
  buildProofsRedeemer,
  buildSettingsData,
  buildSettingsV1Data,
  decodeSettingsDatum,
  decodeSettingsV1Data,
  makeRedeemerWrapper,
  makeVoidData,
  parseProofJSON,
  Proof,
} from "../contracts/index.js";
import { mayFail, mayFailAsync } from "../helpers/index.js";

/**
 * @interface
 * @typedef {object} MintParams
 * @property {NetworkName} network Network
 * @property {Address} address Wallet Address to perform mint
 * @property {Trie} db MPF Database for all handles
 */
interface PrepareMintParams {
  network: NetworkName;
  blockfrostApiKey: string;
  paymentAddress: Address;
  folderPath: string;
  handles: string[];
}

/**
 * @description Mint Handles from Order
 * @param {PrepareMintParams} params
 * @param {string} blockfrostApiKey Blockfrost API Key
 * @returns {Promise<Result<TxBuilder,  Error>>} Transaction Result
 */
const prepareMintingTransaction = async (
  params: PrepareMintParams
): Promise<Result<TxBuilder, Error>> => {
  const { network, paymentAddress, blockfrostApiKey, folderPath, handles } =
    params;

  // TODO: Should come from settings Handle
  const configsResult = mayFail(() => GET_CONFIGS(network));
  if (!configsResult.ok) return Err(new Error(configsResult.error));
  const { ALLOWED_MINTERS, MINT_V1_SCRIPT_UTXO_ID } = configsResult.data;

  if (paymentAddress.era == "Byron")
    return Err(new Error("Byron Address not supported"));

  const isMainnet = network == "mainnet";

  const blockfrostV0Client = makeBlockfrostV0Client(network, blockfrostApiKey);

  const contractsConfig = buildContracts({
    network,
  });
  const {
    order: orderConfig,
    settingsProxy: settingsProxyConfig,
    settingsV1: settingsV1Config,
    mintV1: mintV1Config,
    mintProxy: mintProxyConfig,
  } = contractsConfig;

  // fetch mint v1 ref script
  const mintV1ScriptUtxoResult = await mayFailAsync(() =>
    blockfrostV0Client.getUtxo(MINT_V1_SCRIPT_UTXO_ID)
  ).complete();
  if (!mintV1ScriptUtxoResult.ok)
    return Err(
      new Error(
        `Failed to fetch Mint V1 Reference Script: ${mintV1ScriptUtxoResult.error}`
      )
    );
  const mintV1ScriptUtxo = mintV1ScriptUtxoResult.data;

  // fetch settings proxy asset
  const settingsProxyAssetsUtxosResult = await mayFailAsync(() =>
    blockfrostV0Client.getUtxosWithAssetClass(
      settingsProxyConfig.settingsProxyScriptAddress,
      settingsProxyConfig.settingsProxyAssetClass
    )
  ).complete();
  if (!settingsProxyAssetsUtxosResult.ok)
    return Err(
      new Error(
        `Failed to fetch settings proxy assets: ${settingsProxyAssetsUtxosResult.error}`
      )
    );
  if (!(settingsProxyAssetsUtxosResult.data.length > 0))
    return Err(new Error(`Settings Proxy Asset not found`));
  const settingsProxyAssetUtxo = settingsProxyAssetsUtxosResult.data[0];

  // decode settings and settings v1
  const decodedSettings = decodeSettingsDatum(
    settingsProxyAssetUtxo.output.datum
  );
  const decodedSettingsV1 = decodeSettingsV1Data(decodedSettings.data);

  const proofs: Proof[] = [];

  const db = await Trie.load(new Store(folderPath));

  for (const handleName of handles) {
    try {
      // TODO: Add way to remove from database when transaction fails
      await db.insert(handleName, "NEW");
      const mpfProof = await db.prove(handleName);
      proofs.push(parseProofJSON(mpfProof.toJSON()));
    } catch (e) {
      console.warn("Handle already exists", handleName, e);
      return Err(new Error(`Handle "${handleName}" already exists`));
    }
  }

  // update all handles for new settings (mpf root hash)
  decodedSettingsV1.all_handles = db.hash.toString("hex");
  // set updated SettingsV1 to Settings
  decodedSettings.data = buildSettingsV1Data(decodedSettingsV1);

  const settingsValue = makeValue(
    5_000_000n,
    makeAssets([[settingsProxyConfig.settingsProxyAssetClass, 1n]])
  );

  // build proofs redeemer for mint v1 withdraw
  const proofsRedeemer = buildProofsRedeemer(proofs);

  // start building tx
  const txBuilder = makeTxBuilder({
    isMainnet,
  });

  // <-- add required signer
  txBuilder.addSigners(makePubKeyHash(ALLOWED_MINTERS[0]));

  // <-- attach settings proxy spend validator
  txBuilder.attachUplcProgram(
    settingsProxyConfig.settingsProxySpendUplcProgram
  );

  // <-- spend settings utxo
  txBuilder.spendUnsafe(
    settingsProxyAssetUtxo,
    makeRedeemerWrapper(makeVoidData())
  );

  // <-- lock settings value with new settings
  txBuilder.payUnsafe(
    settingsProxyConfig.settingsProxyScriptAddress,
    settingsValue,
    makeInlineTxOutputDatum(buildSettingsData(decodedSettings))
  );

  // <-- attach settings v1 withdrawl validator
  txBuilder.attachUplcProgram(settingsV1Config.settingsV1StakeUplcProgram);

  // <-- withdraw from settings v1 validator
  txBuilder.withdrawUnsafe(
    settingsV1Config.settingsV1StakingAddress,
    0n,
    makeVoidData()
  );

  // <-- add mint v1 script reference input
  txBuilder.refer(mintV1ScriptUtxo);

  // <-- withdraw from mint v1 withdraw validator (script from reference input)
  txBuilder.withdrawUnsafe(
    mintV1Config.mintV1StakingAddress,
    0n,
    proofsRedeemer
  );

  // <-- pay treasury fee
  txBuilder.payUnsafe(
    decodedSettingsV1.treasury_address,
    makeValue(decodedSettingsV1.treasury_fee * BigInt(handles.length)),
    makeInlineTxOutputDatum(makeVoidData())
  );

  // <-- pay minter fee
  txBuilder.payUnsafe(
    paymentAddress,
    makeValue(decodedSettingsV1.minter_fee * BigInt(handles.length))
  );

  // <-- attach mint prxoy validator
  txBuilder.attachUplcProgram(mintProxyConfig.mintProxyMintUplcProgram);

  // <-- attach order script
  txBuilder.attachUplcProgram(orderConfig.orderSpendUplcProgram);

  // TODO: input and output for ROOT_SETTINGS_HANDLE (possibly different name)

  return Ok(txBuilder);
};

export type { PrepareMintParams };
export { prepareMintingTransaction };
