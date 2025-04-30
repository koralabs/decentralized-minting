import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import { ByteArrayLike, IntLike } from "@helios-lang/codec-utils";
import {
  Address,
  makeAssetClass,
  makeAssets,
  makeMintingPolicyHash,
  makeValue,
  TxInput,
} from "@helios-lang/ledger";
import { TxBuilder } from "@helios-lang/tx-utils";
import { Err, Ok, Result } from "ts-res";

import { PREFIX_100, PREFIX_222 } from "../constants/index.js";
import {
  buildOrderExecuteRedeemer,
  decodeOrderDatum,
  HandlePrices,
  makeVoidData,
  NewHandle,
} from "../contracts/index.js";
import { getNetwork, invariant } from "../helpers/index.js";
import { calculateHandlePriceFromHandlePriceInfo } from "../utils/index.js";
import { prepareNewMintTransaction } from "./prepareNewMint.js";

/**
 * @interface
 * @typedef {object} MintNewHandlesParams
 * @property {Address} address Wallet Address to perform mint
 * @property {HandlePrices} latestHandlePrices Latest Handle Prices to update while minting
 * @property {TxInput[]} ordersTxInputs Orders UTxOs
 * @property {Trie} db Trie DB
 * @property {string} blockfrostApiKey Blockfrost API Key
 */
interface MintNewHandlesParams {
  address: Address;
  latestHandlePrices: HandlePrices;
  ordersTxInputs: TxInput[];
  db: Trie;
  blockfrostApiKey: string;
}

/**
 * @description Mint Handles from Order (only new handles)
 * @param {MintNewHandlesParams} params
 * @returns {Promise<Result<TxBuilder,  Error>>} Transaction Result
 */
const mintNewHandles = async (
  params: MintNewHandlesParams
): Promise<Result<TxBuilder, Error>> => {
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

  const orderedHandles: NewHandle[] = ordersTxInputs.map((order) => {
    const decodedOrder = decodeOrderDatum(order.datum, network);
    return {
      utf8Name: Buffer.from(decodedOrder.requested_handle, "hex").toString(
        "utf8"
      ),
      hexName: decodedOrder.requested_handle,
      destinationAddress: decodedOrder.destination_address,
      treasuryFee: order.value.lovelace,
      minterFee: order.value.lovelace,
    };
  });

  const preparedTxBuilderResult = await prepareNewMintTransaction({
    ...params,
    handles: orderedHandles,
  });

  if (!preparedTxBuilderResult.ok) {
    return Err(
      new Error(
        `Failed to prepare New Mint Transaction: ${preparedTxBuilderResult.error}`
      )
    );
  }
  const { txBuilder, deployedScripts, settingsV1, handlePriceInfo } =
    preparedTxBuilderResult.data;
  const { mintProxyScriptDetails } = deployedScripts;
  const newPolicyHash = makeMintingPolicyHash(
    mintProxyScriptDetails.validatorHash
  );

  const mintingHandlesData = [];
  for (const orderTxInput of ordersTxInputs) {
    const decodedOrder = decodeOrderDatum(orderTxInput.datum, network);
    const { destination_address, requested_handle } = decodedOrder;
    const utf8Name = Buffer.from(requested_handle, "hex").toString("utf8");

    const refHandleAssetClass = makeAssetClass(
      newPolicyHash,
      `${PREFIX_100}${requested_handle}`
    );
    const userHandleAssetClass = makeAssetClass(
      newPolicyHash,
      `${PREFIX_222}${requested_handle}`
    );

    const lovelace = orderTxInput.value.lovelace;
    const handlePrice = calculateHandlePriceFromHandlePriceInfo(
      utf8Name,
      handlePriceInfo
    );

    // check order input lovelace is bigger than handle price
    invariant(lovelace >= handlePrice, "Order Input lovelace insufficient");

    const refHandleValue = makeValue(
      1n,
      makeAssets([[refHandleAssetClass, 1n]])
    );
    const userHandleValue = makeValue(
      1n,
      makeAssets([[userHandleAssetClass, 1n]])
    );
    const destinationAddress = destination_address;

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
  mintingHandlesData.forEach((mintingHandle) => {
    const { refHandleAssetClass, userHandleAssetClass } = mintingHandle;
    mintingHandlesTokensValue.push(
      [refHandleAssetClass.tokenName, 1n],
      [userHandleAssetClass.tokenName, 1n]
    );
  });
  txBuilder.mintPolicyTokensUnsafe(
    newPolicyHash,
    mintingHandlesTokensValue,
    makeVoidData()
  );
  for (const mintingHandle of mintingHandlesData) {
    const {
      orderTxInput,
      refHandleValue,
      userHandleValue,
      destinationAddress,
    } = mintingHandle;

    txBuilder
      .spendUnsafe(orderTxInput, buildOrderExecuteRedeemer())
      // TODO:
      // Add Personalization Datum
      .payUnsafe(settingsV1.pz_script_address, refHandleValue)
      .payUnsafe(destinationAddress, userHandleValue);
  }

  return Ok(txBuilder);
};

export type { MintNewHandlesParams };
export { mintNewHandles };
