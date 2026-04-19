import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import type { Cardano as CardanoTypes } from "@cardano-sdk/core";
import { Err, Ok, Result } from "ts-res";

import { PREFIX_100, PREFIX_222 } from "../constants/index.js";
import {
  buildOrderExecuteRedeemer,
  decodeOrderDatum,
  HandlePrices,
  NewHandle,
  plutusDataToCbor,
} from "../contracts/index.js";
import { Cardano, type HexBlob, Serialization } from "../helpers/cardano-sdk/index.js";
import { getNetwork, invariant } from "../helpers/index.js";
import { calculateHandlePriceFromHandlePriceInfo } from "../utils/index.js";
import { prepareNewMintTransaction } from "./prepareNewMint.js";
import { type FinalizedTx, finalizeTxPlan, type TxPlan } from "./txPlan.js";

interface MintNewHandlesParams {
  changeAddress: string;
  minterKeyHash: string;
  latestHandlePrices: HandlePrices;
  ordersTxInputs: CardanoTypes.Utxo[];
  walletUtxos: CardanoTypes.Utxo[];
  collateralUtxo?: CardanoTypes.Utxo;
  db: Trie;
  blockfrostApiKey: string;
}

/**
 * Mint new handles by consuming `ordersTxInputs` (UTxOs at the orders-spend
 * script), extending the prepare-new-mint spec with the per-order mint ops
 * (policy-tokens mint + ref/user handle outputs), and finalizing to unsigned
 * CBOR.
 */
const mintNewHandles = async (
  params: MintNewHandlesParams,
): Promise<Result<FinalizedTx, Error>> => {
  const { ordersTxInputs, blockfrostApiKey } = params;
  const network = getNetwork(blockfrostApiKey);

  ordersTxInputs.sort((a, b) =>
    `${a[0].txId}#${a[0].index}` > `${b[0].txId}#${b[0].index}` ? 1 : -1,
  );
  if (ordersTxInputs.length === 0) {
    return Err(new Error("No Order requested"));
  }

  const orderedHandles: NewHandle[] = ordersTxInputs.map((order) => {
    const datumCbor = coreInlineDatumToCbor(order[1].datum);
    const decodedOrder = decodeOrderDatum(datumCbor, network);
    return {
      utf8Name: Buffer.from(decodedOrder.requested_handle, "hex").toString("utf8"),
      hexName: decodedOrder.requested_handle,
      destinationAddress: decodedOrder.destination_address,
      treasuryFee: order[1].value.coins,
      minterFee: order[1].value.coins,
    };
  });

  const preparedResult = await prepareNewMintTransaction({
    ...params,
    handles: orderedHandles,
  });
  if (!preparedResult.ok) {
    return Err(
      new Error(
        `Failed to prepare New Mint Transaction: ${preparedResult.error}`,
      ),
    );
  }

  const { plan, deployedScripts, settingsV1, handlePriceInfo } =
    preparedResult.data;
  const mintProxyPolicyId = deployedScripts.mintProxyScript.details.validatorHash;

  // Add each order as a pre-selected input with its OrderExecute redeemer.
  const orderRedeemers: CardanoTypes.Redeemer[] = ordersTxInputs.map(
    (_utxo, idx) => ({
      data: Serialization.PlutusData.fromCbor(
        plutusDataToCbor(buildOrderExecuteRedeemer()) as HexBlob,
      ).toCore(),
      executionUnits: { memory: 0, steps: 0 },
      index: idx + 1, // 0 is the minting-data spend
      purpose: Cardano.RedeemerPurpose.spend,
    }),
  );

  // Build mint map + outputs for each handle.
  const mint = plan.mint ?? new Map<CardanoTypes.AssetId, bigint>();
  const newOutputs: CardanoTypes.TxOut[] = [];
  for (let i = 0; i < ordersTxInputs.length; i++) {
    const orderTxInput = ordersTxInputs[i];
    const datumCbor = coreInlineDatumToCbor(orderTxInput[1].datum);
    const decodedOrder = decodeOrderDatum(datumCbor, network);
    const { destination_address, requested_handle } = decodedOrder;
    const utf8Name = Buffer.from(requested_handle, "hex").toString("utf8");

    const refAssetId = Cardano.AssetId.fromParts(
      Cardano.PolicyId(mintProxyPolicyId as HexBlob),
      Cardano.AssetName(`${PREFIX_100}${requested_handle}` as HexBlob),
    );
    const userAssetId = Cardano.AssetId.fromParts(
      Cardano.PolicyId(mintProxyPolicyId as HexBlob),
      Cardano.AssetName(`${PREFIX_222}${requested_handle}` as HexBlob),
    );

    const lovelace = orderTxInput[1].value.coins;
    const handlePrice = calculateHandlePriceFromHandlePriceInfo(
      utf8Name,
      handlePriceInfo,
    );
    invariant(lovelace >= handlePrice, "Order Input lovelace insufficient");

    mint.set(refAssetId, 1n);
    mint.set(userAssetId, 1n);

    newOutputs.push({
      address: settingsV1.pz_script_address as unknown as CardanoTypes.TxOut["address"],
      value: { coins: 0n, assets: new Map([[refAssetId, 1n]]) },
    });
    newOutputs.push({
      address: destination_address as unknown as CardanoTypes.TxOut["address"],
      value: { coins: 0n, assets: new Map([[userAssetId, 1n]]) },
    });
  }

  // Mint redeemer (mint proxy is a native-style V2 script with an index 0
  // redeemer that the validator inspects as a void).
  const mintRedeemer: CardanoTypes.Redeemer = {
    data: Serialization.PlutusData.fromCbor(
      plutusDataToCbor({ constructor: 0n, fields: { items: [] } }) as HexBlob,
    ).toCore(),
    executionUnits: { memory: 0, steps: 0 },
    index: 0,
    purpose: Cardano.RedeemerPurpose.mint,
  };

  const extendedPlan: TxPlan = {
    ...plan,
    preSelectedUtxos: [...plan.preSelectedUtxos, ...ordersTxInputs],
    outputs: [...plan.outputs, ...newOutputs],
    redeemers: [...(plan.redeemers ?? []), ...orderRedeemers, mintRedeemer],
    mint,
  };

  return Ok(await finalizeTxPlan(extendedPlan));
};

const coreInlineDatumToCbor = (
  datum: CardanoTypes.TxOut["datum"],
): string | undefined => {
  if (!datum) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Serialization as any).PlutusData.fromCore(datum).toCbor() as string;
};

export type { MintNewHandlesParams };
export { mintNewHandles };
