import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import {
  makeAssetClass,
  makeAssets,
  makeInlineTxOutputDatum,
  makePubKeyHash,
  makeTxOutputId,
  makeValue,
  TxOutputId,
} from "@helios-lang/ledger";
import {
  BlockfrostV0Client,
  makeTxBuilder,
  SimpleWallet,
} from "@helios-lang/tx-utils";
import fs from "fs/promises";

import { buildContractsConfig } from "./config.js";
import {
  buildProofsRedeemer,
  buildSettingsData,
  buildSettingsV1Data,
  decodeOrderDatum,
  decodeSettingsDatum,
  decodeSettingsV1Data,
  makeEmptyData,
  parseProofJSON,
  Proof,
} from "./contracts/index.js";
import { mayFailTransaction } from "./helpers/index.js";

const mintHandle = (db: Trie, initialTxOutputId: TxOutputId) => {
  return async (wallet: SimpleWallet) => {
    const address = wallet.address;
    const spareUtxos = await wallet.utxos;
    const blockfrostApi = wallet.cardanoClient as BlockfrostV0Client;
    const references = JSON.parse((await fs.readFile("references")).toString());
    const contractsConfig = buildContractsConfig(initialTxOutputId);
    const {
      order: orderConfig,
      settingsProxy: settingsProxyConfig,
      settingsV1: settingsV1Config,
      mintV1: mintV1Config,
      mintProxy: mintProxyConfig,
      handlePolicyHash,
    } = contractsConfig;

    const mintV1ScriptUtxo = await blockfrostApi.getUtxo(
      makeTxOutputId(`${references[0][0]}#${references[0][1]}`)
    );

    const orderUtxos = await blockfrostApi.getUtxos(
      orderConfig.orderScriptAddress
    );

    console.log(
      "Settings Proxy Asset Class is:",
      settingsProxyConfig.settingsProxyAssetClass.toString()
    );
    const settingsProxyAssetUtxo = (
      await blockfrostApi.getUtxosWithAssetClass(
        (
          await blockfrostApi.getAddressesWithAssetClass(
            settingsProxyConfig.settingsProxyAssetClass
          )
        )[0].address,
        settingsProxyConfig.settingsProxyAssetClass
      )
    )[0];
    const decodedSettings = decodeSettingsDatum(
      settingsProxyAssetUtxo.output.datum
    );
    const decodedSettingsV1 = decodeSettingsV1Data(decodedSettings.data);

    const handles = [];
    const proofs: Proof[] = [];
    for (const orderUtxo of orderUtxos) {
      const decodedOrder = decodeOrderDatum(orderUtxo.datum);
      const handleName = Buffer.from(
        decodedOrder.requested_handle,
        "hex"
      ).toString();
      const mintingHandleAssetClass = makeAssetClass(
        handlePolicyHash,
        decodedOrder.requested_handle
      );
      const lovelace = orderUtxo.value.lovelace;
      const handleValue = makeValue(
        lovelace - 2_000_000n,
        makeAssets([[mintingHandleAssetClass, 1n]])
      );
      const destinationAddress = decodedOrder.destination.address;

      try {
        await db.insert(handleName, "NEW");
        const mpfProof = await db.prove(handleName);
        proofs.push(parseProofJSON(mpfProof.toJSON()));
        handles.push({
          utxo: orderUtxo,
          destinationAddress,
          handleValue,
          mintingHandleAssetClass,
          destinationDatum: decodedOrder.destination.datum,
        });
      } catch (e) {
        console.warn("Handle already exists", decodedOrder.requested_handle, e);
      }
    }

    // update all handles (mpf root hash)
    decodedSettingsV1.all_handles = db.hash.toString("hex");
    // set updated SettingsV1 to Settings
    decodedSettings.data = buildSettingsV1Data(decodedSettingsV1);

    const settingsValue = makeValue(
      5_000_000n,
      makeAssets([[settingsProxyConfig.settingsProxyAssetClass, 1n]])
    );

    const proofsRedeemer = buildProofsRedeemer(proofs);

    // start building tx
    const txBuilder = makeTxBuilder({
      isMainnet: blockfrostApi.networkName != "mainnet",
    });

    // <-- add required signer
    txBuilder.addSigners(makePubKeyHash(decodedSettingsV1.allowed_minters[0]));

    // <-- attach settings proxy spend validator
    txBuilder.attachUplcProgram(
      settingsProxyConfig.settingsProxySpendUplcProgram
    );

    // <-- spend settings utxo
    txBuilder.spendUnsafe(settingsProxyAssetUtxo, makeEmptyData());

    // <-- pay settings value with new settings
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
      makeEmptyData()
    );

    // <-- add mint v1 script reference input
    txBuilder.refer(mintV1ScriptUtxo);

    // <-- withdraw from mint v1 withdraw validator (script from reference input)
    txBuilder.withdrawUnsafe(
      mintV1Config.mintV1StakingAddress,
      0n,
      proofsRedeemer
    );

    // <-- attach mint prxoy validator
    txBuilder.attachUplcProgram(mintProxyConfig.mintProxyMintUplcProgram);

    // <-- attach order script
    txBuilder.attachUplcProgram(orderConfig.orderSpendUplcProgram);

    // <-- spend order utxos and mint handle
    // and send minted handle to destination with datum
    for (const handle of handles) {
      txBuilder
        .spendUnsafe(handle.utxo, makeEmptyData())
        .mintAssetClassUnsafe(
          handle.mintingHandleAssetClass,
          1n,
          makeEmptyData()
        )
        .payUnsafe(
          handle.destinationAddress,
          handle.handleValue,
          handle.destinationDatum
        );
    }

    // <-- pay treasury fee
    txBuilder.payUnsafe(
      decodedSettingsV1.treasury_address,
      makeValue(decodedSettingsV1.treasury_fee * BigInt(handles.length))
    );

    // <-- pay minter fee
    txBuilder.payUnsafe(address, makeValue(decodedSettingsV1.minter_fee));

    const txResult = await mayFailTransaction(
      txBuilder,
      address,
      spareUtxos
    ).complete();

    return txResult;
  };
};

export { mintHandle };
