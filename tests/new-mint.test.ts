import { makeTxOutputId } from "@helios-lang/ledger";
import { Ok } from "ts-res";
import { assert, describe } from "vitest";

import {
  decodeMintingDataDatum,
  fetchSettings,
  invariant,
  mayFailTransaction,
  mint,
  request,
} from "../src/index.js";
import { myTest } from "./setup.js";
import { balanceOf, referenceAssetValue, userAssetValue } from "./utils.js";

describe.sequential("Koralab Decentralized Minting Tests", () => {
  myTest(
    "orer new handle - <demi-1>",
    async ({ network, emulator, wallets, ordersDetail }) => {
      invariant(Array.isArray(ordersDetail), "Orders detail is not an array");

      const { usersWallets } = wallets;
      const user1Wallet = usersWallets[0];

      const handleName = "demi-1";

      const txBuilderResult = await request({
        address: user1Wallet.address,
        handle: handleName,
        network,
      });
      invariant(txBuilderResult.ok, "Order tx failed");

      const txBuilder = txBuilderResult.data;
      const tx = await txBuilder.build({
        changeAddress: user1Wallet.address,
        spareUtxos: await user1Wallet.utxos,
      });
      tx.addSignatures(await user1Wallet.signTx(tx));
      const txId = await user1Wallet.submitTx(tx);
      emulator.tick(200);

      const orderTxInput = await emulator.getUtxo(makeTxOutputId(txId, 0));
      invariant(Array.isArray(ordersDetail), "Orders detail is not an array");
      ordersDetail.push({
        handleName,
        txInput: orderTxInput,
      });
    }
  );

  myTest(
    "mint new handle - <demi-1>",
    async ({
      mockedFunctions,
      db,
      network,
      emulator,
      wallets,
      ordersDetail,
    }) => {
      invariant(Array.isArray(ordersDetail), "Orders detail is not an array");

      const { usersWallets, allowedMintersWallets, pzWallet } = wallets;
      const user1Wallet = usersWallets[0];
      const allowedMinter1Wallet = allowedMintersWallets[0];

      const txBuilderResult = await mint({
        address: allowedMinter1Wallet.address,
        ordersTxInputs: ordersDetail.map((order) => order.txInput),
        db,
        blockfrostApiKey: "",
      });
      invariant(txBuilderResult.ok, "Mint Tx Building Failed");

      const txBuilder = txBuilderResult.data;
      const txResult = await mayFailTransaction(
        txBuilder,
        allowedMinter1Wallet.address,
        await allowedMinter1Wallet.utxos
      ).complete();
      invariant(txResult.ok, "Mint Tx Complete Failed");

      const { tx } = txResult.data;
      tx.addSignatures(await allowedMinter1Wallet.signTx(tx));
      const txId = await allowedMinter1Wallet.submitTx(tx);
      emulator.tick(200);

      // check minted values
      const settingsResult = await fetchSettings(network);
      invariant(settingsResult.ok, "Settings Fetch Failed");
      const { settingsV1 } = settingsResult.data;
      const user1Balance = await balanceOf(user1Wallet);
      const pzBalance = await balanceOf(pzWallet);

      assert(
        user1Balance.isGreaterOrEqual(
          userAssetValue(settingsV1.policy_id, ordersDetail[0].handleName)
        ) == true,
        "User 1 Wallet Balance is not correct"
      );
      assert(
        pzBalance.isGreaterOrEqual(
          referenceAssetValue(settingsV1.policy_id, ordersDetail[0].handleName)
        ) == true,
        "PZ Wallet Balance is not correct"
      );

      // update minting data input
      const mintingDataAssetTxInput = await emulator.getUtxo(
        makeTxOutputId(txId, 0)
      );
      const mintingData = decodeMintingDataDatum(mintingDataAssetTxInput.datum);
      mockedFunctions.mockedFetchMintingData.mockReturnValue(
        new Promise((resolve) =>
          resolve(
            Ok({
              mintingData,
              mintingDataAssetTxInput,
            })
          )
        )
      );

      // empty orders detail
      ordersDetail.length = 0;
    }
  );
});
