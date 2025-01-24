import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import { Blaze, Blockfrost, Core, Data, Wallet } from "@blaze-cardano/sdk";
import {
  makeAssetClass,
  makeAssets,
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
  buildSettingsV1Data,
  decodeOrderDatum,
  decodeSettingsDatum,
  decodeSettingsV1Data,
  parseProofJSON,
  Proof,
} from "./contracts/index.js";
import * as handle from "./types/handle-mint.js";
import { address_to_address, plutusVoid, proof_to_proof } from "./utils.js";

const mintHandle = (db: Trie, initialTxOutputId: TxOutputId) => {
  return async (wallet: SimpleWallet) => {
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

    const mintScriptUtxo = await blockfrostApi.getUtxo(
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
      const mintedHandleAssetClass = makeAssetClass(
        handlePolicyHash,
        decodedOrder.requested_handle
      );
      const lovelace = orderUtxo.value.lovelace;
      const handleValue = makeValue(
        lovelace - 2_000_000n,
        makeAssets([[mintedHandleAssetClass, 1n]])
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
          mintedHandleAssetClass,
          destinationDatum: decodedOrder.destination.datum,
        });
      } catch (e) {
        console.warn("Handle already exists", decodedOrder.requested_handle);
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

    // <-- add mint script reference input
    txBuilder.refer(mintScriptUtxo);

    // <-- add required signer
    txBuilder.addSigners(makePubKeyHash(decodedSettingsV1.allowed_minters[0]));

    // <-- attach settings proxy spend validator
    txBuilder.attachUplcProgram(
      settingsProxyConfig.settingsProxySpendUplcProgram
    );

    // <-- spend settings utxo
    // TODO: void data as redeemer
    txBuilder.spendUnsafe(settingsProxyAssetUtxo);

    // <-- attach settings v1 withdrawl validator
    txBuilder.attachUplcProgram(settingsV1Config.settingsV1StakeUplcProgram);

    // <-- withdraw from settings v1 validator
    // TODO: void data as redeemer
    txBuilder.withdrawUnsafe(settingsV1Config.settingsV1StakingAddress, 0n);

    // <-- withdraw from mint v1 withdraw validator (script from reference input)
    txBuilder.withdrawUnsafe(
      mintV1Config.mintV1StakingAddress,
      0n,
      proofsRedeemer
    );

    // <-- attach order script
    txBuilder.attachUplcProgram(orderConfig.orderSpendUplcProgram);

    // <-- spend order utxos
    for (const handle of handles) {
      // TODO: void data as redeemer
      txBuilder
        .spendUnsafe(handle.utxo)
        .payWithDatum(
          handle.destinationAddress,
          handle.handleValue,
          handle.destinationDatum
        );
    }

    const tx = blaze
      .newTransaction()
      .addReferenceInput(mint_script_utxo)
      .addRequiredSigner(
        Core.Ed25519KeyHashHex(settings_v1_datum.allowedMinters[0])
      )
      .addInput(
        settings_utxo,
        Data.to({ wrapper: plutusVoid() }, handle.SettingsProxySpend._r)
      )
      .provideScript(contracts.scripts.settings_proxy)
      .addWithdrawal(contracts.utils.settings_v1_withdraw, 0n, plutusVoid())
      .provideScript(contracts.scripts.settings_v1)
      .addWithdrawal(contracts.utils.mint_v1_withdraw, 0n, proofs_redeemer)
      // .provideScript(contracts.scripts.mint_v1) // Don't need to provide this script, because reference input'
      .provideScript(contracts.scripts.order)
      .provideScript(contracts.scripts.mint_proxy)
      .lockAssets(
        contracts.utils.settings_address,
        settings_value,
        Data.to(settings_datum, handle.SettingsProxySpend.datum)
      )
      .lockLovelace(
        address_to_address(settings_v1_datum.treasuryAddress),
        settings_v1_datum.treasuryFee * BigInt(handles.length),
        plutusVoid()
      )
      .payLovelace(
        await blaze.wallet.getChangeAddress(),
        settings_v1_datum.minterFee * BigInt(handles.length)
      );
    for (const handle of handles) {
      tx.addInput(handle.utxo, plutusVoid())
        .payAssets(handle.destination_address, handle.handle_value) // TODO: datum
        .addMint(
          Core.PolicyId(contracts.scripts.mint_proxy.hash()),
          new Map([[handle.handle_asset_name, 1n]]),
          plutusVoid()
        );
    }
    return await tx.complete();
  };
};

export { mintHandle };
