import { ByteArrayLike, IntLike } from "@helios-lang/codec-utils";
import { addValues, makeTxOutputId } from "@helios-lang/ledger";
import { Ok } from "ts-res";
import { assert, describe } from "vitest";

import {
  cancel,
  decodeHandlePriceInfoDatum,
  decodeMintingDataDatum,
  fetchSettings,
  inspect,
  invariant,
  makeVoidData,
  mayFailTransaction,
  mintNewHandles,
  prepareLegacyMintTransaction,
  removeHandle,
  request,
} from "../src/index.js";
import { myTest } from "./setup.js";
import {
  balanceOf,
  getRandomString,
  logMemAndCpu,
  referenceAssetClass,
  referenceAssetValue,
  userAssetClass,
  userAssetValue,
  virtualSubHandleAssetClass,
  virtualSubHandleAssetValue,
} from "./utils.js";

describe.sequential("Koralab Decentralized Minting Tests", () => {
  // user_1 orders new handle - <demi-1>
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

  // mint new handle - <demi-1>
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

      const txBuilderResult = await mintNewHandles({
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
      logMemAndCpu(txResult);

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

      // update handle price info input
      const handlePriceInfoAssetTxInput = await emulator.getUtxo(
        makeTxOutputId(txId, 1)
      );
      const handlePriceInfo = decodeHandlePriceInfoDatum(
        handlePriceInfoAssetTxInput.datum
      );
      mockedFunctions.mockedFetchHandlePriceInfoData.mockReturnValue(
        new Promise((resolve) =>
          resolve(
            Ok({
              handlePriceInfo,
              handlePriceInfoAssetTxInput,
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

  // user_3 orders new handle - <demi-3>
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

  // user_2 orders new handle - <demi-2>
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

  // mint new handles - <demi-2, demi-3>
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

      const txBuilderResult = await mintNewHandles({
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
      logMemAndCpu(txResult);

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
          userAssetValue(settingsV1.policy_id, ordersDetail[1].handleName)
        ) == true,
        "User 2 Wallet Balance is not correct"
      );
      assert(
        user3Balance.isGreaterOrEqual(
          userAssetValue(settingsV1.policy_id, ordersDetail[0].handleName)
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

      // update handle price info input
      const handlePriceInfoAssetTxInput = await emulator.getUtxo(
        makeTxOutputId(txId, 1)
      );
      const handlePriceInfo = decodeHandlePriceInfoDatum(
        handlePriceInfoAssetTxInput.datum
      );
      mockedFunctions.mockedFetchHandlePriceInfoData.mockReturnValue(
        new Promise((resolve) =>
          resolve(
            Ok({
              handlePriceInfo,
              handlePriceInfoAssetTxInput,
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

  // mint legacy handles - <legacy-1, legacy-2>
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
      const allowedMinter1Wallet = allowedMintersWallets[0];

      const handleNames = ["legacy-1", "legacy-2"];

      const txBuilderResult = await prepareLegacyMintTransaction({
        address: allowedMinter1Wallet.address,
        handles: handleNames.map((handleName) => ({
          hexName: Buffer.from(handleName, "utf8").toString("hex"),
          utf8Name: handleName,
          isVirtual: false,
        })),
        db,
        blockfrostApiKey: "",
      });
      invariant(txBuilderResult.ok, "Mint Tx Building Failed");

      const { txBuilder } = txBuilderResult.data;

      // mint legacy handles
      txBuilder.attachUplcProgram(legacyMintUplcProgram);
      const mintingHandlesTokensValue: [ByteArrayLike, IntLike][] = [];
      handleNames.forEach((handleName) =>
        mintingHandlesTokensValue.push(
          [referenceAssetClass(legacyPolicyId, handleName).tokenName, 1n],
          [userAssetClass(legacyPolicyId, handleName).tokenName, 1n]
        )
      );
      txBuilder.mintPolicyTokensUnsafe(
        legacyPolicyId,
        mintingHandlesTokensValue,
        makeVoidData()
      );
      handleNames.forEach((handleName) =>
        txBuilder
          .payUnsafe(
            pzWallet.address,
            referenceAssetValue(legacyPolicyId, handleName)
          )
          .payUnsafe(
            user1Wallet.address,
            userAssetValue(legacyPolicyId, handleName)
          )
      );

      const txResult = await mayFailTransaction(
        txBuilder,
        allowedMinter1Wallet.address,
        await allowedMinter1Wallet.utxos
      ).complete();
      invariant(txResult.ok, "Mint Tx Complete Failed");
      logMemAndCpu(txResult);

      const { tx } = txResult.data;
      tx.addSignatures(await allowedMinter1Wallet.signTx(tx));
      const txId = await allowedMinter1Wallet.submitTx(tx);
      emulator.tick(200);

      // check minted values
      const user1Balance = await balanceOf(user1Wallet);
      const pzBalance = await balanceOf(pzWallet);

      assert(
        user1Balance.isGreaterOrEqual(
          addValues(
            handleNames.map((handleName) =>
              userAssetValue(legacyPolicyId, handleName)
            )
          )
        ) == true,
        "User 1 Wallet Balance is not correct"
      );
      assert(
        pzBalance.isGreaterOrEqual(
          addValues(
            handleNames.map((handleName) =>
              referenceAssetValue(legacyPolicyId, handleName)
            )
          )
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

  // user_2 orders new handle - <demi-4>
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

  // user_3 orders new handle - <demi-5>
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

  // mint new handles after minting legacy handles - <demi-4, demi-5>
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

      const txBuilderResult = await mintNewHandles({
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
      logMemAndCpu(txResult);

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

      // update handle price info input
      const handlePriceInfoAssetTxInput = await emulator.getUtxo(
        makeTxOutputId(txId, 1)
      );
      const handlePriceInfo = decodeHandlePriceInfoDatum(
        handlePriceInfoAssetTxInput.datum
      );
      mockedFunctions.mockedFetchHandlePriceInfoData.mockReturnValue(
        new Promise((resolve) =>
          resolve(
            Ok({
              handlePriceInfo,
              handlePriceInfoAssetTxInput,
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

  // user_4 orders new sub handle which is not supported - <demi-6@user_4>
  myTest(
    "user_4 orders new sub handle which is not supported - <demi-6@user_4>",
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

  // can not mint new handle, because that is sub handle - <demi-6@user_4>
  myTest(
    "can not mint new handle, because that is sub handle - <demi-6@user_4>",
    async ({ db, wallets, ordersDetail }) => {
      invariant(Array.isArray(ordersDetail), "Orders detail is not an array");

      const { allowedMintersWallets } = wallets;
      const allowedMinter1Wallet = allowedMintersWallets[0];

      const handleNames = ordersDetail.map((order) => order.handleName);

      const txBuilderResult = await mintNewHandles({
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

      assert(txResult.error.message.includes("expect !is_sub_handle"));
    }
  );

  // user_4 cancel his order, because sub handle is not supported - <demi-6@user_4>
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

  // user_4 orders new handle, but handle is too long - <abcdefghijklmnop>
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

  // can not mint new handle, because that is too long - <abcdefghijklmnop>
  myTest(
    "can not mint new handle, because that is too long - <abcdefghijklmnop>",
    async ({ db, wallets, ordersDetail }) => {
      invariant(Array.isArray(ordersDetail), "Orders detail is not an array");

      const { allowedMintersWallets } = wallets;
      const allowedMinter1Wallet = allowedMintersWallets[0];

      const handleNames = ordersDetail.map((order) => order.handleName);

      const txBuilderResult = await mintNewHandles({
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
          "expect handle_length <= max_handle_length"
        )
      );
    }
  );

  // user_4 cancel his order, because handle is too long - <abcdefghijklmnop>
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

  // can not mint legacy handles if minting value is not correct - <legacy-3, legacy-4>
  myTest(
    "can not mint legacy handles if minting value is not correct - <legacy-3, legacy-4>",
    async ({ db, legacyMintUplcProgram, legacyPolicyId, wallets }) => {
      const { usersWallets, allowedMintersWallets } = wallets;
      const user1Wallet = usersWallets[0];
      const allowedMinter1Wallet = allowedMintersWallets[0];

      const handleNames = ["legacy-3", "legacy-4"];

      const txBuilderResult = await prepareLegacyMintTransaction({
        address: allowedMinter1Wallet.address,
        handles: handleNames.map((handleName) => ({
          hexName: Buffer.from(handleName, "utf8").toString("hex"),
          utf8Name: handleName,
          isVirtual: false,
        })),
        db,
        blockfrostApiKey: "",
      });
      invariant(txBuilderResult.ok, "Mint Tx Building Failed");

      const { txBuilder } = txBuilderResult.data;

      // mint legacy handles
      txBuilder.attachUplcProgram(legacyMintUplcProgram);
      const mintingHandlesTokensValue: [ByteArrayLike, IntLike][] = [];
      handleNames.forEach((handleName) =>
        mintingHandlesTokensValue.push([
          // Missing ref asset
          userAssetClass(legacyPolicyId, handleName).tokenName,
          1n,
        ])
      );
      txBuilder.mintPolicyTokensUnsafe(
        legacyPolicyId,
        mintingHandlesTokensValue,
        makeVoidData()
      );
      handleNames.forEach((handleName) =>
        txBuilder.payUnsafe(
          user1Wallet.address,
          userAssetValue(legacyPolicyId, handleName)
        )
      );

      const txResult = await mayFailTransaction(
        txBuilder,
        allowedMinter1Wallet.address,
        await allowedMinter1Wallet.utxos
      ).complete();
      invariant(!txResult.ok, "Mint Tx Complete should fail");

      // remove handle from DB as rollback
      for (const handleName of handleNames) await removeHandle(db, handleName);

      assert(txResult.error.message.includes("value.merge"));
    }
  );

  // mint legacy sub handle - <legacy-1@user_1>
  myTest(
    "mint legacy sub handle - <legacy-1@user_1>",
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
      const allowedMinter1Wallet = allowedMintersWallets[0];

      const handleNames = ["legacy-1@user_1"];

      const txBuilderResult = await prepareLegacyMintTransaction({
        address: allowedMinter1Wallet.address,
        handles: handleNames.map((handleName) => ({
          hexName: Buffer.from(handleName, "utf8").toString("hex"),
          utf8Name: handleName,
          isVirtual: false,
        })),
        db,
        blockfrostApiKey: "",
      });
      invariant(txBuilderResult.ok, "Mint Tx Building Failed");

      const { txBuilder } = txBuilderResult.data;

      // mint legacy handles
      txBuilder.attachUplcProgram(legacyMintUplcProgram);
      const mintingHandlesTokensValue: [ByteArrayLike, IntLike][] = [];
      handleNames.forEach((handleName) =>
        mintingHandlesTokensValue.push(
          [referenceAssetClass(legacyPolicyId, handleName).tokenName, 1n],
          [userAssetClass(legacyPolicyId, handleName).tokenName, 1n]
        )
      );
      txBuilder.mintPolicyTokensUnsafe(
        legacyPolicyId,
        mintingHandlesTokensValue,
        makeVoidData()
      );
      handleNames.forEach((handleName) =>
        txBuilder
          .payUnsafe(
            pzWallet.address,
            referenceAssetValue(legacyPolicyId, handleName)
          )
          .payUnsafe(
            user1Wallet.address,
            userAssetValue(legacyPolicyId, handleName)
          )
      );

      const txResult = await mayFailTransaction(
        txBuilder,
        allowedMinter1Wallet.address,
        await allowedMinter1Wallet.utxos
      ).complete();
      invariant(txResult.ok, "Mint Tx Complete Failed");
      logMemAndCpu(txResult);

      const { tx } = txResult.data;
      tx.addSignatures(await allowedMinter1Wallet.signTx(tx));
      const txId = await allowedMinter1Wallet.submitTx(tx);
      emulator.tick(200);

      // check minted values
      const user1Balance = await balanceOf(user1Wallet);
      const pzBalance = await balanceOf(pzWallet);

      assert(
        user1Balance.isGreaterOrEqual(
          addValues([userAssetValue(legacyPolicyId, handleNames[0])])
        ) == true,
        "User 1 Wallet Balance is not correct"
      );
      assert(
        pzBalance.isGreaterOrEqual(
          addValues([referenceAssetValue(legacyPolicyId, handleNames[0])])
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

  // mint legacy virtual sub handle - <legacy-virtual-1@user_1>
  myTest(
    "mint legacy virtual sub handle - <legacy-virtual-1@user_1>",
    async ({
      mockedFunctions,
      db,
      emulator,
      legacyMintUplcProgram,
      legacyPolicyId,
      wallets,
    }) => {
      const { allowedMintersWallets, pzWallet } = wallets;
      const allowedMinter1Wallet = allowedMintersWallets[0];

      const handleNames = ["legacy-virtual-1@user_1"];

      const txBuilderResult = await prepareLegacyMintTransaction({
        address: allowedMinter1Wallet.address,
        handles: handleNames.map((handleName) => ({
          hexName: Buffer.from(handleName, "utf8").toString("hex"),
          utf8Name: handleName,
          isVirtual: true,
        })),
        db,
        blockfrostApiKey: "",
      });
      invariant(txBuilderResult.ok, "Mint Tx Building Failed");

      const { txBuilder } = txBuilderResult.data;

      // mint legacy handles
      txBuilder.attachUplcProgram(legacyMintUplcProgram);
      const mintingHandlesTokensValue: [ByteArrayLike, IntLike][] = [];
      handleNames.forEach((handleName) =>
        mintingHandlesTokensValue.push([
          virtualSubHandleAssetClass(legacyPolicyId, handleName).tokenName,
          1n,
        ])
      );
      txBuilder.mintPolicyTokensUnsafe(
        legacyPolicyId,
        mintingHandlesTokensValue,
        makeVoidData()
      );
      handleNames.forEach((handleName) =>
        txBuilder.payUnsafe(
          pzWallet.address,
          virtualSubHandleAssetValue(legacyPolicyId, handleName)
        )
      );

      const txResult = await mayFailTransaction(
        txBuilder,
        allowedMinter1Wallet.address,
        await allowedMinter1Wallet.utxos
      ).complete();
      invariant(txResult.ok, "Mint Tx Complete Failed");
      logMemAndCpu(txResult);

      const { tx } = txResult.data;
      tx.addSignatures(await allowedMinter1Wallet.signTx(tx));
      const txId = await allowedMinter1Wallet.submitTx(tx);
      emulator.tick(200);

      // check minted values
      const pzBalance = await balanceOf(pzWallet);

      assert(
        pzBalance.isGreaterOrEqual(
          addValues([
            virtualSubHandleAssetValue(legacyPolicyId, handleNames[0]),
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

  // can not mint legacy sub handle, if sub handle is too long - <abcdefghijklmnopqrstuv@user_1>
  myTest(
    "can not mint legacy sub handle, if sub handle is too long - <abcdefghijklmnopqrstuv@user_1>",
    async ({ db, legacyMintUplcProgram, legacyPolicyId, wallets }) => {
      const { usersWallets, allowedMintersWallets, pzWallet } = wallets;
      const user1Wallet = usersWallets[0];
      const allowedMinter1Wallet = allowedMintersWallets[0];

      const handleNames = ["abcdefghijklmnopqrstuv@user_1"];

      const txBuilderResult = await prepareLegacyMintTransaction({
        address: allowedMinter1Wallet.address,
        handles: handleNames.map((handleName) => ({
          hexName: Buffer.from(handleName, "utf8").toString("hex"),
          utf8Name: handleName,
          isVirtual: false,
        })),
        db,
        blockfrostApiKey: "",
      });
      invariant(txBuilderResult.ok, "Mint Tx Building Failed");

      const { txBuilder } = txBuilderResult.data;

      // mint legacy handles
      txBuilder.attachUplcProgram(legacyMintUplcProgram);
      const mintingHandlesTokensValue: [ByteArrayLike, IntLike][] = [];
      handleNames.forEach((handleName) =>
        mintingHandlesTokensValue.push(
          [referenceAssetClass(legacyPolicyId, handleName).tokenName, 1n],
          [userAssetClass(legacyPolicyId, handleName).tokenName, 1n]
        )
      );
      txBuilder.mintPolicyTokensUnsafe(
        legacyPolicyId,
        mintingHandlesTokensValue,
        makeVoidData()
      );
      handleNames.forEach((handleName) =>
        txBuilder
          .payUnsafe(
            pzWallet.address,
            referenceAssetValue(legacyPolicyId, handleName)
          )
          .payUnsafe(
            user1Wallet.address,
            userAssetValue(legacyPolicyId, handleName)
          )
      );

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
          "expect handle_length <= max_sub_handle_length"
        )
      );
    }
  );

  // can not mint legacy sub handle, if root handle is too long - <legacy-1@abcdefghijklmnop>
  myTest(
    "can not mint legacy sub handle, if root handle is too long - <legacy-1@abcdefghijklmnop>",
    async ({ db, legacyMintUplcProgram, legacyPolicyId, wallets }) => {
      const { usersWallets, allowedMintersWallets, pzWallet } = wallets;
      const user1Wallet = usersWallets[0];
      const allowedMinter1Wallet = allowedMintersWallets[0];

      const handleNames = ["legacy-1@abcdefghijklmnop"];

      const txBuilderResult = await prepareLegacyMintTransaction({
        address: allowedMinter1Wallet.address,
        handles: handleNames.map((handleName) => ({
          hexName: Buffer.from(handleName, "utf8").toString("hex"),
          utf8Name: handleName,
          isVirtual: false,
        })),
        db,
        blockfrostApiKey: "",
      });
      invariant(txBuilderResult.ok, "Mint Tx Building Failed");

      const { txBuilder } = txBuilderResult.data;

      // mint legacy handles
      txBuilder.attachUplcProgram(legacyMintUplcProgram);
      const mintingHandlesTokensValue: [ByteArrayLike, IntLike][] = [];
      handleNames.forEach((handleName) =>
        mintingHandlesTokensValue.push(
          [referenceAssetClass(legacyPolicyId, handleName).tokenName, 1n],
          [userAssetClass(legacyPolicyId, handleName).tokenName, 1n]
        )
      );
      txBuilder.mintPolicyTokensUnsafe(
        legacyPolicyId,
        mintingHandlesTokensValue,
        makeVoidData()
      );
      handleNames.forEach((handleName) =>
        txBuilder
          .payUnsafe(
            pzWallet.address,
            referenceAssetValue(legacyPolicyId, handleName)
          )
          .payUnsafe(
            user1Wallet.address,
            userAssetValue(legacyPolicyId, handleName)
          )
      );

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
          "expect root_handle_length <= max_handle_length"
        )
      );
    }
  );

  // can not mint legacy virtual sub handle, if minted value is not correct (must be prefix_000) - <legacy-virtual-2@user_1
  myTest(
    "can not mint legacy virtual sub handle, if minted value is not correct (must be prefix_000) - <legacy-virtual-2@user_1",
    async ({ db, legacyMintUplcProgram, legacyPolicyId, wallets }) => {
      const { usersWallets, allowedMintersWallets, pzWallet } = wallets;
      const user1Wallet = usersWallets[0];
      const allowedMinter1Wallet = allowedMintersWallets[0];

      const handleNames = ["legacy-virtual-2@user_1"];

      const txBuilderResult = await prepareLegacyMintTransaction({
        address: allowedMinter1Wallet.address,
        handles: handleNames.map((handleName) => ({
          hexName: Buffer.from(handleName, "utf8").toString("hex"),
          utf8Name: handleName,
          isVirtual: true,
        })),
        db,
        blockfrostApiKey: "",
      });
      invariant(txBuilderResult.ok, "Mint Tx Building Failed");

      const { txBuilder } = txBuilderResult.data;

      // mint legacy handles
      txBuilder.attachUplcProgram(legacyMintUplcProgram);
      const mintingHandlesTokensValue: [ByteArrayLike, IntLike][] = [];
      handleNames.forEach((handleName) =>
        mintingHandlesTokensValue.push(
          [referenceAssetClass(legacyPolicyId, handleName).tokenName, 1n],
          [userAssetClass(legacyPolicyId, handleName).tokenName, 1n]
        )
      );
      txBuilder.mintPolicyTokensUnsafe(
        legacyPolicyId,
        mintingHandlesTokensValue,
        makeVoidData()
      );
      handleNames.forEach((handleName) =>
        txBuilder
          .payUnsafe(
            pzWallet.address,
            referenceAssetValue(legacyPolicyId, handleName)
          )
          .payUnsafe(
            user1Wallet.address,
            userAssetValue(legacyPolicyId, handleName)
          )
      );

      const txResult = await mayFailTransaction(
        txBuilder,
        allowedMinter1Wallet.address,
        await allowedMinter1Wallet.utxos
      ).complete();
      invariant(!txResult.ok, "Mint Tx Complete should fail");

      // remove handle from DB as rollback
      for (const handleName of handleNames) await removeHandle(db, handleName);

      assert(txResult.error.message.includes("value.merge"));
    }
  );

  // ======= mint many handles =======

  // user_2 orders many handle - <12 random handles>
  myTest(
    "user_2 orders many handle - <12 random handles>",
    async ({ network, emulator, wallets, ordersDetail }) => {
      invariant(Array.isArray(ordersDetail), "Orders detail is not an array");

      const { usersWallets } = wallets;
      const user1Wallet = usersWallets[0];

      const handleNames = Array.from({ length: 12 }, () =>
        getRandomString(8, 15)
      );

      for (const handleName of handleNames) {
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
    }
  );

  // mint many handles - <12 random handles>
  myTest(
    "mint many handles - <12 random handles>",
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

      const txBuilderResult = await mintNewHandles({
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
      logMemAndCpu(txResult);

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

      ordersDetail.map((orderDetail) => {
        assert(
          user1Balance.isGreaterOrEqual(
            userAssetValue(settingsV1.policy_id, orderDetail.handleName)
          ) == true,
          "User 1 Wallet Balance is not correct"
        );
        assert(
          pzBalance.isGreaterOrEqual(
            referenceAssetValue(settingsV1.policy_id, orderDetail.handleName)
          ) == true,
          "PZ Wallet Balance is not correct"
        );
      });

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

      // update handle price info input
      const handlePriceInfoAssetTxInput = await emulator.getUtxo(
        makeTxOutputId(txId, 1)
      );
      const handlePriceInfo = decodeHandlePriceInfoDatum(
        handlePriceInfoAssetTxInput.datum
      );
      mockedFunctions.mockedFetchHandlePriceInfoData.mockReturnValue(
        new Promise((resolve) =>
          resolve(
            Ok({
              handlePriceInfo,
              handlePriceInfoAssetTxInput,
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
    "mint legacy handles - <20 random handles>",
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
      const allowedMinter1Wallet = allowedMintersWallets[0];

      const handleNames = Array.from({ length: 20 }, () =>
        getRandomString(8, 15)
      );

      const txBuilderResult = await prepareLegacyMintTransaction({
        address: allowedMinter1Wallet.address,
        handles: handleNames.map((handleName) => ({
          hexName: Buffer.from(handleName, "utf8").toString("hex"),
          utf8Name: handleName,
          isVirtual: false,
        })),
        db,
        blockfrostApiKey: "",
      });
      invariant(txBuilderResult.ok, "Mint Tx Building Failed");

      const { txBuilder } = txBuilderResult.data;

      // mint legacy handles
      txBuilder.attachUplcProgram(legacyMintUplcProgram);
      const mintingHandlesTokensValue: [ByteArrayLike, IntLike][] = [];
      handleNames.forEach((handleName) =>
        mintingHandlesTokensValue.push(
          [referenceAssetClass(legacyPolicyId, handleName).tokenName, 1n],
          [userAssetClass(legacyPolicyId, handleName).tokenName, 1n]
        )
      );
      txBuilder.mintPolicyTokensUnsafe(
        legacyPolicyId,
        mintingHandlesTokensValue,
        makeVoidData()
      );
      handleNames.forEach((handleName) =>
        txBuilder
          .payUnsafe(
            pzWallet.address,
            referenceAssetValue(legacyPolicyId, handleName)
          )
          .payUnsafe(
            user1Wallet.address,
            userAssetValue(legacyPolicyId, handleName)
          )
      );

      const txResult = await mayFailTransaction(
        txBuilder,
        allowedMinter1Wallet.address,
        await allowedMinter1Wallet.utxos
      ).complete();
      invariant(txResult.ok, "Mint Tx Complete Failed");
      logMemAndCpu(txResult);
      const { tx } = txResult.data;
      tx.addSignatures(await allowedMinter1Wallet.signTx(tx));
      const txId = await allowedMinter1Wallet.submitTx(tx);
      emulator.tick(200);

      // check minted values
      const user1Balance = await balanceOf(user1Wallet);
      const pzBalance = await balanceOf(pzWallet);

      assert(
        user1Balance.isGreaterOrEqual(
          addValues(
            handleNames.map((handleName) =>
              userAssetValue(legacyPolicyId, handleName)
            )
          )
        ) == true,
        "User 1 Wallet Balance is not correct"
      );
      assert(
        pzBalance.isGreaterOrEqual(
          addValues(
            handleNames.map((handleName) =>
              referenceAssetValue(legacyPolicyId, handleName)
            )
          )
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
});
