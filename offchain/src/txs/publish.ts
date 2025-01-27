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
  BlockfrostV0Client,
  makeTxBuilder,
  SimpleWallet,
} from "@helios-lang/tx-utils";
import { promises as fs } from "fs";

import {
  INITIAL_UTXO_PATH,
  REFERENCE_SCRIPT_UTXO_PATH,
} from "../configs/index.js";
import {
  buildContractsConfig,
  buildSettingsData,
  buildSettingsV1Data,
  makeVoidData,
  Settings,
  SettingsV1,
} from "../contracts/index.js";
import { BuildTx, mayFailTransaction } from "../helpers/index.js";
import { checkAccountRegistrationStatus } from "../utils/index.js";

export const publish =
  (db: Trie): BuildTx =>
  async (wallet: SimpleWallet) => {
    const blockfrostCardanoClient = wallet.cardanoClient as BlockfrostV0Client;
    const blockfrostApi = new BlockFrostAPI({
      projectId: blockfrostCardanoClient.projectId,
    });
    const networkParams = await blockfrostCardanoClient.parameters;
    const address = wallet.address;
    const spareUtxos = await wallet.utxos;
    const initialUtxo = spareUtxos.shift()!;
    await fs.writeFile(
      INITIAL_UTXO_PATH,
      Buffer.from(`${initialUtxo.id.txId.toHex()}#${initialUtxo.id.index}`)
    );
    const contractsConfig = buildContractsConfig(initialUtxo.id);
    const {
      settingsProxy: settingsProxyConfig,
      settingsV1: settingsV1Config,
      mintV1: mintV1Config,
    } = contractsConfig;

    const minter = address.spendingCredential.toHex();
    const settingsV1: SettingsV1 = {
      all_handles: db.hash.toString("hex"),
      allowed_minters: [minter],
      minter_fee: 1_000_000n,
      treasury_fee: 1_000_000n,
      policy_id: contractsConfig.handlePolicyHash.toHex(),
      treasury_address: address,
      // TODO:
      // remove staking credential from treasury address??
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
      isMainnet: await wallet.isMainnet(),
    });

    // <-- spend initial utxo
    txBuilder.spendUnsafe(initialUtxo);

    // <-- attach settings proxy mint validator
    txBuilder.attachUplcProgram(
      settingsProxyConfig.settingsProxyMintUplcProgram
    );

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

    const txResult = await mayFailTransaction(
      txBuilder,
      address,
      spareUtxos
    ).complete();
    if (txResult.ok) {
      await fs.writeFile(
        REFERENCE_SCRIPT_UTXO_PATH,
        JSON.stringify([[bytesToHex(txResult.data.tx.body.hash()), 1]])
      );
    }
    return txResult;
  };
