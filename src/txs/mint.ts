import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import { ByteArrayLike, IntLike } from "@helios-lang/codec-utils";
import {
  Address,
  makeAssetClass,
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
  buildOrderExecuteRedeemer,
  buildProofsRedeemer,
  buildSettingsData,
  buildSettingsV1Data,
  decodeOrderDatum,
  decodeSettingsDatum,
  decodeSettingsV1Data,
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
interface MintParams {
  network: NetworkName;
  address: Address;
  db: Trie;
}

/**
 * @description Mint Handles from Order
 * @param {MintParams} params
 * @param {string} blockfrostApiKey Blockfrost API Key
 * @returns {Promise<Result<TxBuilder,  Error>>} Transaction Result
 */
const mint = async (
  params: MintParams,
  blockfrostApiKey: string
): Promise<Result<TxBuilder, Error>> => {
  const { network, address, db } = params;
  const configsResult = mayFail(() => GET_CONFIGS(network));
  if (!configsResult.ok) return Err(new Error(configsResult.error));
  const {
    SETTINGS_ASSET_CLASS,
    ALLOWED_MINTERS,
    MINTER_FEE,
    TREASURY_FEE,
    MINT_V1_SCRIPT_UTXO_ID,
  } = configsResult.data;
  if (address.era == "Byron")
    return Err(new Error("Byron Address not supported"));
  const isMainnet = network == "mainnet";

  const blockfrostV0Client = makeBlockfrostV0Client(network, blockfrostApiKey);

  const contractsConfig = buildContracts({
    network,
  });
  const {
    order: orderConfig,
    mintV1: mintV1Config,
    mintProxy: mintProxyConfig,
    handlePolicyHash,
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

  // fetch order utxos
  const orderUtxosResult = await mayFailAsync(() =>
    blockfrostV0Client.getUtxos(orderConfig.orderScriptAddress)
  ).complete();
  if (!orderUtxosResult.ok)
    return Err(
      new Error(`Failed to fetch order UTxOs: ${orderUtxosResult.error}`)
    );
  // remove invalid order utxos
  const orderUtxos = orderUtxosResult.data.filter((utxo) => {
    const decodedResult = mayFail(() => decodeOrderDatum(utxo.datum));
    return decodedResult.ok;
  });

  // fetch settings asset
  // const settingsAssetAddressResult = await mayFailAsync(
  //   async () =>
  //     (
  //       await blockfrostV0Client.getAddressesWithAssetClass(
  //         SETTINGS_ASSET_CLASS
  //       )
  //     )[0].address
  // ).complete();
  // if (!settingsAssetAddressResult.ok)
  //   return Err(
  //     new Error(orderUtxos
  //       `Failed to fetch Settings Asset Address: ${settingsAssetAddressResult.error}`
  //     )
  //   );
  // const settingsAssetAddress = settingsAssetAddressResult.data;
  const settingsAssetAddress = address;
  const settingsAssetUtxoResult = await mayFailAsync(
    async () =>
      (
        await blockfrostV0Client.getUtxosWithAssetClass(
          settingsAssetAddress,
          SETTINGS_ASSET_CLASS
        )
      )[0]
  ).complete();
  if (!settingsAssetUtxoResult.ok)
    return Err(
      new Error(
        `Failed to fetch Settings Asset: ${settingsAssetUtxoResult.error}`
      )
    );
  const settingsAssetUtxo = settingsAssetUtxoResult.data;

  // decode settings and settings v1
  const decodedSettings = decodeSettingsDatum(settingsAssetUtxo.output.datum);
  const decodedSettingsV1 = decodeSettingsV1Data(decodedSettings.data);

  const handles = [];
  const proofs: Proof[] = [];

  // NOTE:
  // sort orderUtxos before process
  // because tx inputs is sorted lexicographically
  // we have to insert handle in same order as tx inputs
  orderUtxos.sort((a, b) => (a.id.toString() > b.id.toString() ? 1 : -1));

  if (orderUtxos.length == 0) return Err(new Error("No Order requested"));

  console.log(`${orderUtxos.length} Handles are ordered`);
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
      lovelace - (TREASURY_FEE + MINTER_FEE),
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
      return Err(new Error(`Handle "${handleName}" already exists`));
    }
  }

  // update all handles for new settings (mpf root hash)
  decodedSettingsV1.all_handles = db.hash.toString("hex");
  // set updated SettingsV1 to Settings
  decodedSettings.data = buildSettingsV1Data(decodedSettingsV1);

  const settingsValue = makeValue(
    5_000_000n,
    makeAssets([[SETTINGS_ASSET_CLASS, 1n]])
  );

  // build proofs redeemer for mint v1 withdraw
  const proofsRedeemer = buildProofsRedeemer(proofs);

  // start building tx
  const txBuilder = makeTxBuilder({
    isMainnet,
  });

  // <-- add required signer
  txBuilder.addSigners(makePubKeyHash(ALLOWED_MINTERS[0]));

  // <-- spend settings utxo
  txBuilder.spendUnsafe(settingsAssetUtxo);

  // <-- lock settings value with new settings
  txBuilder.payUnsafe(
    settingsAssetAddress,
    settingsValue,
    makeInlineTxOutputDatum(buildSettingsData(decodedSettings))
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
    address,
    makeValue(decodedSettingsV1.minter_fee * BigInt(handles.length))
  );

  // <-- attach mint prxoy validator
  txBuilder.attachUplcProgram(mintProxyConfig.mintProxyMintUplcProgram);

  // <-- attach order script
  txBuilder.attachUplcProgram(orderConfig.orderSpendUplcProgram);

  // <-- spend order utxos and mint handle
  // and send minted handle to destination with datum
  const mintingHandlesTokensValue: [ByteArrayLike, IntLike][] = handles.map(
    (handle) => [handle.mintingHandleAssetClass.tokenName, 1n]
  );
  txBuilder.mintPolicyTokensUnsafe(
    handlePolicyHash,
    mintingHandlesTokensValue,
    makeVoidData()
  );
  for (const handle of handles) {
    txBuilder
      .spendUnsafe(handle.utxo, buildOrderExecuteRedeemer())
      .payUnsafe(
        handle.destinationAddress,
        handle.handleValue,
        handle.destinationDatum
      );
  }

  return Ok(txBuilder);
};

export type { MintParams };
export { mint };
