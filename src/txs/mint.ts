import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import { ByteArrayLike, IntLike } from "@helios-lang/codec-utils";
import {
  Address,
  AssetClass,
  makeAssetClass,
  makeAssets,
  makeMintingPolicyHash,
  makeValue,
  TxInput,
  TxOutputId,
} from "@helios-lang/ledger";
import { TxBuilder } from "@helios-lang/tx-utils";
import { Err, Ok, Result } from "ts-res";

import {
  PREFIX_100,
  PREFIX_222,
  PZ_UTXO_MIN_LOVELACE,
} from "../constants/index.js";
import {
  buildOrderExecuteRedeemer,
  decodeOrderDatum,
  makeVoidData,
} from "../contracts/index.js";
import { getNetwork } from "../helpers/index.js";
import { prepareNewMintTransaction } from "./prepareNewMint.js";

/**
 * @interface
 * @typedef {object} MintParams
 * @property {Address} address Wallet Address to perform mint
 * @property {TxInput[]} ordersTxInputs Orders UTxOs
 * @property {Trie} db Trie DB
 * @property {AssetClass} settingsAssetClass De Mi Contract's Settings Asset Class
 * @property {TxOutputId} settingsAssetTxOutputId De Mi Contract's Settings Asset Tx Output ID
 * @property {AssetClass} mintingDataAssetClass De Mi Contract's Minting Data Asset Class
 * @property {TxOutputId} mintingDataAssetTxOutputId De Mi Contract's Minting Data Asset Tx Output ID
 * @property {string} blockfrostApiKey Blockfrost API Key
 */
interface MintParams {
  address: Address;
  ordersTxInputs: TxInput[];
  db: Trie;
  settingsAssetClass: AssetClass;
  settingsAssetTxOutputId: TxOutputId;
  mintingDataAssetClass: AssetClass;
  mintingDataAssetTxOutputId: TxOutputId;
  blockfrostApiKey: string;
}

/**
 * @description Mint Handles from Order
 * @param {MintParams} params
 * @returns {Promise<Result<TxBuilder,  Error>>} Transaction Result
 */
const mint = async (params: MintParams): Promise<Result<TxBuilder, Error>> => {
  const { ordersTxInputs, blockfrostApiKey } = params;
  const network = getNetwork(blockfrostApiKey);

  // refactor Orders Tx Inputs
  // NOTE:
  // sort orderUtxos before process
  // because tx inputs is sorted lexicographically
  // we have to insert handle in same order as tx inputs
  ordersTxInputs.sort((a, b) => (a.id.toString() > b.id.toString() ? 1 : -1));
  if (ordersTxInputs.length == 0) return Err(new Error("No Order requested"));
  console.log(`${ordersTxInputs.length} Handles are ordered`);
  const handles = ordersTxInputs.map((order) => {
    const decodedOrder = decodeOrderDatum(order.datum, network);
    return Buffer.from(decodedOrder.requested_handle, "hex").toString("utf8");
  });
  const preparedTxBuilderResult = await prepareNewMintTransaction({
    ...params,
    handles,
  });

  if (!preparedTxBuilderResult.ok) {
    return Err(
      new Error(
        `Failed to prepare New Mint Transaction: ${preparedTxBuilderResult.error}`
      )
    );
  }
  const { txBuilder, deployedScripts, settingsV1 } =
    preparedTxBuilderResult.data;
  const { minter_fee, treasury_fee } = settingsV1;
  const { mintProxyScriptDetails } = deployedScripts;
  const newPolicyHash = makeMintingPolicyHash(
    mintProxyScriptDetails.validatorHash
  );

  const mintingHandlesData = [];
  for (const orderTxInput of ordersTxInputs) {
    const decodedOrder = decodeOrderDatum(orderTxInput.datum, network);
    const refHandleAssetClass = makeAssetClass(
      newPolicyHash,
      `${PREFIX_100}${decodedOrder.requested_handle}`
    );
    const userHandleAssetClass = makeAssetClass(
      newPolicyHash,
      `${PREFIX_222}${decodedOrder.requested_handle}`
    );
    const lovelace = orderTxInput.value.lovelace;
    const refHandleValue = makeValue(
      PZ_UTXO_MIN_LOVELACE,
      makeAssets([[refHandleAssetClass, 1n]])
    );
    const userHandleValue = makeValue(
      lovelace - (minter_fee + treasury_fee),
      makeAssets([[userHandleAssetClass, 1n]])
    );
    const destinationAddress = decodedOrder.destination.address;

    mintingHandlesData.push({
      orderTxInput,
      destinationAddress,
      refHandleValue,
      userHandleValue,
      refHandleAssetClass,
      userHandleAssetClass,
    });
  }

  // <-- spend order utxos and mint handle
  // and send minted handle to destination with datum
  const mintingHandlesTokensValue: [ByteArrayLike, IntLike][] = [];
  mintingHandlesData.forEach((mintingHandle) =>
    mintingHandlesTokensValue.push(
      [mintingHandle.refHandleAssetClass.tokenName, 1n],
      [mintingHandle.userHandleAssetClass.tokenName, 1n]
    )
  );
  txBuilder.mintPolicyTokensUnsafe(
    newPolicyHash,
    mintingHandlesTokensValue,
    makeVoidData()
  );
  for (const mintingHandle of mintingHandlesData) {
    txBuilder
      .spendUnsafe(mintingHandle.orderTxInput, buildOrderExecuteRedeemer())
      .payUnsafe(settingsV1.pz_script_address, mintingHandle.refHandleValue)
      .payUnsafe(
        mintingHandle.destinationAddress,
        mintingHandle.userHandleValue
      );
  }

  return Ok(txBuilder);
};

export type { MintParams };
export { mint };
