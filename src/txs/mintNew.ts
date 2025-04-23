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

import { PREFIX_000, PREFIX_100, PREFIX_222 } from "../constants/index.js";
import {
  buildOrderExecuteAsNewRedeemer,
  decodeOrderDatum,
  Handle,
  makeVoidData,
} from "../contracts/index.js";
import { getNetwork, invariant } from "../helpers/index.js";
import { calculateHandlePrice } from "../utils/index.js";
import { prepareNewMintTransaction } from "./prepareNewMint.js";

/**
 * @interface
 * @typedef {object} MintNewHandlesParams
 * @property {Address} address Wallet Address to perform mint
 * @property {TxInput[]} ordersTxInputs Orders UTxOs
 * @property {Trie} db Trie DB
 * @property {string} blockfrostApiKey Blockfrost API Key
 */
interface MintNewHandlesParams {
  address: Address;
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

  const orderedHandles: Handle[] = ordersTxInputs.map((order) => {
    const decodedOrder = decodeOrderDatum(order.datum, network);
    return {
      utf8Name: Buffer.from(decodedOrder.requested_handle, "hex").toString(
        "utf8"
      ),
      hexName: decodedOrder.requested_handle,
      destination: decodedOrder.destination,
      isLegacy: decodedOrder.is_legacy === 1n,
      isVirtual: decodedOrder.is_virtual === 1n,
      price: order.value.lovelace,
    };
  });

  // check every handle is new
  const areAllNewHandles = orderedHandles.every((handle) => !handle.isLegacy);
  if (!areAllNewHandles) {
    return Err(new Error("Must mint only new handles"));
  }

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
    const { destination, is_virtual, requested_handle } = decodedOrder;
    const utf8Name = Buffer.from(requested_handle, "hex").toString("utf8");

    const refHandleAssetClass = makeAssetClass(
      newPolicyHash,
      `${PREFIX_100}${requested_handle}`
    );
    const userHandleAssetClass = makeAssetClass(
      newPolicyHash,
      `${PREFIX_222}${requested_handle}`
    );
    const virtualHandleAssetClass = makeAssetClass(
      newPolicyHash,
      `${PREFIX_000}${requested_handle}`
    );

    const lovelace = orderTxInput.value.lovelace;
    const handlePrice = calculateHandlePrice(utf8Name, handlePriceInfo);

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
    const virtualHandleValue = makeValue(
      1n,
      makeAssets([[virtualHandleAssetClass, 1n]])
    );
    const destinationAddress = destination.address;

    mintingHandlesData.push({
      orderTxInput,
      destinationAddress,
      refHandleValue,
      userHandleValue,
      virtualHandleValue,
      refHandleAssetClass,
      userHandleAssetClass,
      virtualHandleAssetClass,
      isVirtual: is_virtual === 1n ? true : false,
    });
  }

  // <-- spend order utxos and mint handle
  // and send minted handle to destination with datum
  const mintingHandlesTokensValue: [ByteArrayLike, IntLike][] = [];
  mintingHandlesData.forEach((mintingHandle) => {
    const {
      isVirtual,
      refHandleAssetClass,
      userHandleAssetClass,
      virtualHandleAssetClass,
    } = mintingHandle;
    if (isVirtual) {
      mintingHandlesTokensValue.push([virtualHandleAssetClass.tokenName, 1n]);
    } else {
      mintingHandlesTokensValue.push(
        [refHandleAssetClass.tokenName, 1n],
        [userHandleAssetClass.tokenName, 1n]
      );
    }
  });
  txBuilder.mintPolicyTokensUnsafe(
    newPolicyHash,
    mintingHandlesTokensValue,
    makeVoidData()
  );
  for (const mintingHandle of mintingHandlesData) {
    const {
      orderTxInput,
      isVirtual,
      refHandleValue,
      userHandleValue,
      virtualHandleValue,
      destinationAddress,
    } = mintingHandle;

    if (isVirtual) {
      txBuilder
        .spendUnsafe(orderTxInput, buildOrderExecuteAsNewRedeemer())
        // TODO:
        // Add Personalization Datum
        .payUnsafe(settingsV1.pz_script_address, virtualHandleValue);
    } else {
      txBuilder
        .spendUnsafe(orderTxInput, buildOrderExecuteAsNewRedeemer())
        // TODO:
        // Add Personalization Datum
        .payUnsafe(settingsV1.pz_script_address, refHandleValue)
        .payUnsafe(destinationAddress, userHandleValue);
    }
  }

  return Ok(txBuilder);
};

export type { MintNewHandlesParams };
export { mintNewHandles };
