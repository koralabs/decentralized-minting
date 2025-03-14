import { ByteArrayLike, IntLike } from "@helios-lang/codec-utils";
import { addValues, makeTxOutputId } from "@helios-lang/ledger";
import { Ok } from "ts-res";
import { assert, describe } from "vitest";

import {
  cancel,
  decodeMintingDataDatum,
  fetchSettings,
  inspect,
  invariant,
  makeVoidData,
  mayFailTransaction,
  mint,
  prepareLegacyMintTransaction,
  removeHandle,
  request,
} from "../src/index.js";
import { myTest } from "./setup.js";
import {
  balanceOf,
  referenceAssetClass,
  referenceAssetValue,
  userAssetClass,
  userAssetValue,
} from "./utils.js";

describe.sequential("Koralab Decentralized Minting Tests", () => {
  myTest(
    "user_1 orders new handle - <demi-1>",
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

      // inspect db
      inspect(db);
    }
  );

  myTest(
    "user_2 orders new handle - <demi-2>",
    async ({ network, emulator, wallets, ordersDetail }) => {
      invariant(Array.isArray(ordersDetail), "Orders detail is not an array");

      const { usersWallets } = wallets;
      const user2Wallet = usersWallets[1];

      const handleName = "demi-2";

      const txBuilderResult = await request({
        address: user2Wallet.address,
        handle: handleName,
        network,
      });
      invariant(txBuilderResult.ok, "Order tx failed");

      const txBuilder = txBuilderResult.data;
      const tx = await txBuilder.build({
        changeAddress: user2Wallet.address,
        spareUtxos: await user2Wallet.utxos,
      });
      tx.addSignatures(await user2Wallet.signTx(tx));
      const txId = await user2Wallet.submitTx(tx);
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
    "user_3 orders new handle - <demi-3>",
    async ({ network, emulator, wallets, ordersDetail }) => {
      invariant(Array.isArray(ordersDetail), "Orders detail is not an array");

      const { usersWallets } = wallets;
      const user3Wallet = usersWallets[2];

      const handleName = "demi-3";

      const txBuilderResult = await request({
        address: user3Wallet.address,
        handle: handleName,
        network,
      });
      invariant(txBuilderResult.ok, "Order tx failed");

      const txBuilder = txBuilderResult.data;
      const tx = await txBuilder.build({
        changeAddress: user3Wallet.address,
        spareUtxos: await user3Wallet.utxos,
      });
      tx.addSignatures(await user3Wallet.signTx(tx));
      const txId = await user3Wallet.submitTx(tx);
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
    "mint new handles - <demi-2, demi-3>",
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
      const user2Wallet = usersWallets[1];
      const user3Wallet = usersWallets[2];
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
      const user2Balance = await balanceOf(user2Wallet);
      const user3Balance = await balanceOf(user3Wallet);
      const pzBalance = await balanceOf(pzWallet);

      assert(
        user2Balance.isGreaterOrEqual(
          userAssetValue(settingsV1.policy_id, ordersDetail[0].handleName)
        ) == true,
        "User 2 Wallet Balance is not correct"
      );
      assert(
        user3Balance.isGreaterOrEqual(
          userAssetValue(settingsV1.policy_id, ordersDetail[1].handleName)
        ) == true,
        "User 3 Wallet Balance is not correct"
      );
      assert(
        pzBalance.isGreaterOrEqual(
          addValues([
            referenceAssetValue(
              settingsV1.policy_id,
              ordersDetail[0].handleName
            ),
            referenceAssetValue(
              settingsV1.policy_id,
              ordersDetail[1].handleName
            ),
          ])
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

      // inspect db
      inspect(db);
    }
  );

  myTest(
    "mint legacy handles - <legacy-1, legacy-2>",
    async ({
      mockedFunctions,
      db,
      emulator,
      legacyMintUplcProgram,
      legacyPolicyId,
      wallets,
    }) => {
      const { usersWallets, allowedMintersWallets, pzWallet } = wallets;
      const user1Wallet = usersWallets[0];
      const allowedMinter2Wallet = allowedMintersWallets[1];
      const legacyHandles = ["legacy-1", "legacy-2"];

      const txBuilderResult = await prepareLegacyMintTransaction({
        address: allowedMinter2Wallet.address,
        handles: legacyHandles,
        db,
        blockfrostApiKey: "",
      });
      invariant(txBuilderResult.ok, "Mint Tx Building Failed");

      const { txBuilder, settingsV1 } = txBuilderResult.data;

      // mint legacy handles
      txBuilder.attachUplcProgram(legacyMintUplcProgram);
      const mintingHandlesTokensValue: [ByteArrayLike, IntLike][] = [];
      legacyHandles.forEach((handle) =>
        mintingHandlesTokensValue.push(
          [referenceAssetClass(legacyPolicyId, handle).tokenName, 1n],
          [userAssetClass(legacyPolicyId, handle).tokenName, 1n]
        )
      );
      txBuilder.mintPolicyTokensUnsafe(
        legacyPolicyId,
        mintingHandlesTokensValue,
        makeVoidData()
      );
      legacyHandles.forEach((handle) =>
        txBuilder
          .payUnsafe(
            settingsV1.pz_script_address,
            referenceAssetValue(legacyPolicyId, handle)
          )
          .payUnsafe(
            user1Wallet.address,
            userAssetValue(legacyPolicyId, handle)
          )
      );

      const txResult = await mayFailTransaction(
        txBuilder,
        allowedMinter2Wallet.address,
        await allowedMinter2Wallet.utxos
      ).complete();
      invariant(txResult.ok, "Mint Tx Complete Failed");

      const { tx } = txResult.data;
      tx.addSignatures(await allowedMinter2Wallet.signTx(tx));
      const txId = await allowedMinter2Wallet.submitTx(tx);
      emulator.tick(200);

      // check minted values
      const user1Balance = await balanceOf(user1Wallet);
      const pzBalance = await balanceOf(pzWallet);

      assert(
        user1Balance.isGreaterOrEqual(
          addValues([
            userAssetValue(legacyPolicyId, legacyHandles[0]),
            userAssetValue(legacyPolicyId, legacyHandles[1]),
          ])
        ) == true,
        "User 1 Wallet Balance is not correct"
      );
      assert(
        pzBalance.isGreaterOrEqual(
          addValues([
            referenceAssetValue(legacyPolicyId, legacyHandles[0]),
            referenceAssetValue(legacyPolicyId, legacyHandles[1]),
          ])
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

      // inspect db
      inspect(db);
    }
  );

  myTest(
    "user_2 orders new handle - <demi-4>",
    async ({ network, emulator, wallets, ordersDetail }) => {
      invariant(Array.isArray(ordersDetail), "Orders detail is not an array");

      const { usersWallets } = wallets;
      const user2Wallet = usersWallets[1];

      const handleName = "demi-4";

      const txBuilderResult = await request({
        address: user2Wallet.address,
        handle: handleName,
        network,
      });
      invariant(txBuilderResult.ok, "Order tx failed");

      const txBuilder = txBuilderResult.data;
      const tx = await txBuilder.build({
        changeAddress: user2Wallet.address,
        spareUtxos: await user2Wallet.utxos,
      });
      tx.addSignatures(await user2Wallet.signTx(tx));
      const txId = await user2Wallet.submitTx(tx);
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
    "user_3 orders new handle - <demi-5>",
    async ({ network, emulator, wallets, ordersDetail }) => {
      invariant(Array.isArray(ordersDetail), "Orders detail is not an array");

      const { usersWallets } = wallets;
      const user3Wallet = usersWallets[2];

      const handleName = "demi-5";

      const txBuilderResult = await request({
        address: user3Wallet.address,
        handle: handleName,
        network,
      });
      invariant(txBuilderResult.ok, "Order tx failed");

      const txBuilder = txBuilderResult.data;
      const tx = await txBuilder.build({
        changeAddress: user3Wallet.address,
        spareUtxos: await user3Wallet.utxos,
      });
      tx.addSignatures(await user3Wallet.signTx(tx));
      const txId = await user3Wallet.submitTx(tx);
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
    "mint new handles after minting legacy handles - <demi-4, demi-5>",
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
      const user2Wallet = usersWallets[1];
      const user3Wallet = usersWallets[2];
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
      const user2Balance = await balanceOf(user2Wallet);
      const user3Balance = await balanceOf(user3Wallet);
      const pzBalance = await balanceOf(pzWallet);

      assert(
        user2Balance.isGreaterOrEqual(
          userAssetValue(settingsV1.policy_id, ordersDetail[0].handleName)
        ) == true,
        "User 2 Wallet Balance is not correct"
      );
      assert(
        user3Balance.isGreaterOrEqual(
          userAssetValue(settingsV1.policy_id, ordersDetail[1].handleName)
        ) == true,
        "User 3 Wallet Balance is not correct"
      );
      assert(
        pzBalance.isGreaterOrEqual(
          addValues([
            referenceAssetValue(
              settingsV1.policy_id,
              ordersDetail[0].handleName
            ),
            referenceAssetValue(
              settingsV1.policy_id,
              ordersDetail[1].handleName
            ),
          ])
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

      // inspect db
      inspect(db);
    }
  );

  myTest(
    "user_4 orders new sub handle but sub handle which is not supported - <demi-6@user_4>",
    async ({ network, emulator, wallets, ordersDetail }) => {
      invariant(Array.isArray(ordersDetail), "Orders detail is not an array");

      const { usersWallets } = wallets;
      const user4Wallet = usersWallets[3];

      const handleName = "demi-6@user_4";

      const txBuilderResult = await request({
        address: user4Wallet.address,
        handle: handleName,
        network,
      });
      invariant(txBuilderResult.ok, "Order tx failed");

      const txBuilder = txBuilderResult.data;
      const tx = await txBuilder.build({
        changeAddress: user4Wallet.address,
        spareUtxos: await user4Wallet.utxos,
      });
      tx.addSignatures(await user4Wallet.signTx(tx));
      const txId = await user4Wallet.submitTx(tx);
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
    "can not mint new handle, because that is sub handle - <demi-6@user_4>",
    async ({ db, wallets, ordersDetail }) => {
      invariant(Array.isArray(ordersDetail), "Orders detail is not an array");

      const { allowedMintersWallets } = wallets;
      const allowedMinter1Wallet = allowedMintersWallets[0];

      const handleNames = ordersDetail.map((order) => order.handleName);

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
      invariant(!txResult.ok, "Mint Tx Complete should fail");

      // remove handle from DB as rollback
      for (const handleName of handleNames) await removeHandle(db, handleName);

      assert(
        txResult.error.message.includes(
          "expect is_sub_handle(handle_name) == False"
        )
      );
    }
  );

  myTest(
    "user_4 cancel his order, because sub handle is not supported - <demi-6@user_4>",
    async ({ network, emulator, wallets, ordersDetail }) => {
      invariant(Array.isArray(ordersDetail), "Orders detail is not an array");

      const { usersWallets } = wallets;
      const user4Wallet = usersWallets[3];

      const orderDetail = ordersDetail[0];

      const txBuilderResult = await cancel({
        address: user4Wallet.address,
        network,
        orderTxInput: orderDetail.txInput,
      });
      invariant(txBuilderResult.ok, "Order tx failed");

      const txBuilder = txBuilderResult.data;
      const tx = await txBuilder.build({
        changeAddress: user4Wallet.address,
        spareUtxos: await user4Wallet.utxos,
      });
      tx.addSignatures(await user4Wallet.signTx(tx));
      await user4Wallet.submitTx(tx);
      emulator.tick(200);

      // empty orders detail
      ordersDetail.length = 0;
    }
  );

  myTest(
    "user_4 orders new handle, but handle is too long - <abcdefghijklmnop>",
    async ({ network, emulator, wallets, ordersDetail }) => {
      invariant(Array.isArray(ordersDetail), "Orders detail is not an array");

      const { usersWallets } = wallets;
      const user4Wallet = usersWallets[3];

      const handleName = "abcdefghijklmnop";

      const txBuilderResult = await request({
        address: user4Wallet.address,
        handle: handleName,
        network,
      });
      invariant(txBuilderResult.ok, "Order tx failed");

      const txBuilder = txBuilderResult.data;
      const tx = await txBuilder.build({
        changeAddress: user4Wallet.address,
        spareUtxos: await user4Wallet.utxos,
      });
      tx.addSignatures(await user4Wallet.signTx(tx));
      const txId = await user4Wallet.submitTx(tx);
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
    "can not mint new handle, because that is too long - <abcdefghijklmnop>",
    async ({ db, wallets, ordersDetail }) => {
      invariant(Array.isArray(ordersDetail), "Orders detail is not an array");

      const { allowedMintersWallets } = wallets;
      const allowedMinter1Wallet = allowedMintersWallets[0];

      const handleNames = ordersDetail.map((order) => order.handleName);

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
      invariant(!txResult.ok, "Mint Tx Complete should fail");

      // remove handle from DB as rollback
      for (const handleName of handleNames) await removeHandle(db, handleName);

      assert(
        txResult.error.message.includes(
          "expect bytearray.length(handle_name) <= max_handle_length"
        )
      );
    }
  );

  myTest(
    "user_4 cancel his order, because handle is too long - <abcdefghijklmnop>",
    async ({ network, emulator, wallets, ordersDetail }) => {
      invariant(Array.isArray(ordersDetail), "Orders detail is not an array");

      const { usersWallets } = wallets;
      const user4Wallet = usersWallets[3];

      const orderDetail = ordersDetail[0];

      const txBuilderResult = await cancel({
        address: user4Wallet.address,
        network,
        orderTxInput: orderDetail.txInput,
      });
      invariant(txBuilderResult.ok, "Order tx failed");

      const txBuilder = txBuilderResult.data;
      const tx = await txBuilder.build({
        changeAddress: user4Wallet.address,
        spareUtxos: await user4Wallet.utxos,
      });
      tx.addSignatures(await user4Wallet.signTx(tx));
      await user4Wallet.submitTx(tx);
      emulator.tick(200);

      // empty orders detail
      ordersDetail.length = 0;
    }
  );

  myTest(
    "can not mint legacy handles if minting value is not correct - <legacy-3, legacy-4>",
    async ({ db, legacyMintUplcProgram, legacyPolicyId, wallets }) => {
      const { usersWallets, allowedMintersWallets } = wallets;
      const user1Wallet = usersWallets[0];
      const allowedMinter2Wallet = allowedMintersWallets[1];
      const legacyHandles = ["legacy-3", "legacy-4"];

      const txBuilderResult = await prepareLegacyMintTransaction({
        address: allowedMinter2Wallet.address,
        handles: legacyHandles,
        db,
        blockfrostApiKey: "",
      });
      invariant(txBuilderResult.ok, "Mint Tx Building Failed");

      const { txBuilder } = txBuilderResult.data;

      // mint legacy handles
      txBuilder.attachUplcProgram(legacyMintUplcProgram);
      const mintingHandlesTokensValue: [ByteArrayLike, IntLike][] = [];
      legacyHandles.forEach((handle) =>
        mintingHandlesTokensValue.push([
          // Missing ref asset
          userAssetClass(legacyPolicyId, handle).tokenName,
          1n,
        ])
      );
      txBuilder.mintPolicyTokensUnsafe(
        legacyPolicyId,
        mintingHandlesTokensValue,
        makeVoidData()
      );
      legacyHandles.forEach((handle) =>
        txBuilder.payUnsafe(
          user1Wallet.address,
          userAssetValue(legacyPolicyId, handle)
        )
      );

      const txResult = await mayFailTransaction(
        txBuilder,
        allowedMinter2Wallet.address,
        await allowedMinter2Wallet.utxos
      ).complete();
      invariant(!txResult.ok, "Mint Tx Complete should fail");

      assert(
        txResult.error.message.includes(
          "expect value.from_minted_value(mint) == expected_mint_value"
        )
      );
    }
  );
});
