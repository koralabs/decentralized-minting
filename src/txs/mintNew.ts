import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import type { Cardano as CardanoTypes } from "@cardano-sdk/core";
import { Err, Ok, Result } from "ts-res";

import { PREFIX_000, PREFIX_100, PREFIX_222 } from "../constants/index.js";
import {
  buildOrderExecuteRedeemer,
  decodeOrderDatum,
  HandlePriceInfo,
  HandlePrices,
  NewHandle,
  plutusDataToCbor,
  type SettingsV1,
} from "../contracts/index.js";
import { Cardano, type HexBlob, Serialization } from "../helpers/cardano-sdk/index.js";
import { getNetwork, invariant } from "../helpers/index.js";
import { calculateHandlePriceFromHandlePriceInfo } from "../utils/index.js";
import { type DeployedScripts } from "./deploy.js";
import { prepareNewMintTransaction } from "./prepareNewMint.js";
import { type FinalizedTx, finalizeTxPlan, type TxPlan } from "./txPlan.js";

/**
 * The fully-augmented orders-path mint plan (minting-data MintDeMiHandles spend + per-order token
 * mints + ref/user outputs + order spends), BEFORE coin selection / finalization. Engines that need
 * to inject additional outputs (the additive owner/minter/treasury fee outputs — DSH-501) or
 * finalize with auxiliary data (free-virtual tx metadata) consume this and run their own finalize;
 * `mintNewHandles` is the thin wrapper that just `finalizeTxPlan`s it.
 */
export interface MintDeMiHandlesPlan {
  plan: TxPlan;
  deployedScripts: DeployedScripts;
  settingsV1: SettingsV1;
  handlePriceInfo: HandlePriceInfo;
}

interface MintDeMiHandlesParams {
  changeAddress: string;
  minterKeyHash: string;
  latestHandlePrices: HandlePrices;
  ordersTxInputs: CardanoTypes.Utxo[];
  walletUtxos: CardanoTypes.Utxo[];
  collateralUtxo?: CardanoTypes.Utxo;
  db: Trie;
  blockfrostApiKey: string;
  /**
   * FREE private virtual claims, keyed by order ref (`${txId}#${index}`). Present only for orders
   * the engine has determined are free private virtuals under the root's allowance — it carries the
   * root's CURRENT free-name set + label set (from the engine's trie/settings tracking) so the mint
   * build can bump the root key and construct the `FreeVirtualData` proof. Absent => the order is
   * paid (nft sub, public virtual, root, or a private virtual past the allowance).
   */
  freeVirtualContexts?: Record<
    string,
    { rootFreeNames: string[]; rootLabels: string }
  >;
}

/**
 * Mint new handles by consuming `ordersTxInputs` (UTxOs at the orders-spend
 * script), extending the prepare-new-mint spec with the per-order mint ops
 * (policy-tokens mint + ref/user handle outputs), and finalizing to unsigned
 * CBOR.
 */
const buildMintDeMiHandlesPlan = async (
  params: MintDeMiHandlesParams,
): Promise<Result<MintDeMiHandlesPlan, Error>> => {
  const { ordersTxInputs, blockfrostApiKey, freeVirtualContexts } = params;
  const network = getNetwork(blockfrostApiKey);

  ordersTxInputs.sort((a, b) =>
    `${a[0].txId}#${a[0].index}` > `${b[0].txId}#${b[0].index}` ? 1 : -1,
  );
  if (ordersTxInputs.length === 0) {
    return Err(new Error("No Order requested"));
  }

  const orderRef = (order: CardanoTypes.Utxo): string =>
    `${order[0].txId}#${order[0].index}`;

  const orderedHandles: NewHandle[] = ordersTxInputs.map((order) => {
    const datumCbor = coreInlineDatumToCbor(order[1].datum);
    const decodedOrder = decodeOrderDatum(datumCbor, network);
    return {
      utf8Name: Buffer.from(decodedOrder.requested_handle, "hex").toString("utf8"),
      hexName: decodedOrder.requested_handle,
      destinationAddress: decodedOrder.destination_address,
      treasuryFee: order[1].value.coins,
      minterFee: order[1].value.coins,
      isVirtual: decodedOrder.is_virtual === 1n,
      freeVirtual: freeVirtualContexts?.[orderRef(order)],
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
    const { destination_address, requested_handle, is_virtual } = decodedOrder;
    const utf8Name = Buffer.from(requested_handle, "hex").toString("utf8");

    const lovelace = orderTxInput[1].value.coins;
    const handlePrice = calculateHandlePriceFromHandlePriceInfo(
      utf8Name,
      handlePriceInfo,
    );
    invariant(lovelace >= handlePrice, "Order Input lovelace insufficient");

    const pzAddress =
      settingsV1.pz_script_address as unknown as CardanoTypes.TxOut["address"];

    if (is_virtual === 1n) {
      // Virtual sub: mint a single 000 token, sent to the pz script (no user-held 222). Consumes
      // ONE output positionally (mirrors the contract's check_virtual_sub_output).
      const virtualAssetId = Cardano.AssetId.fromParts(
        Cardano.PolicyId(mintProxyPolicyId as HexBlob),
        Cardano.AssetName(`${PREFIX_000}${requested_handle}` as HexBlob),
      );
      mint.set(virtualAssetId, 1n);
      newOutputs.push({
        address: pzAddress,
        value: { coins: 0n, assets: new Map([[virtualAssetId, 1n]]) },
      });
    } else {
      // Root / nft sub: mint 100 (ref -> pz) + 222 (user -> destination). Consumes TWO outputs
      // positionally (mirrors check_ref_and_user_outputs): ref first, then user.
      const refAssetId = Cardano.AssetId.fromParts(
        Cardano.PolicyId(mintProxyPolicyId as HexBlob),
        Cardano.AssetName(`${PREFIX_100}${requested_handle}` as HexBlob),
      );
      const userAssetId = Cardano.AssetId.fromParts(
        Cardano.PolicyId(mintProxyPolicyId as HexBlob),
        Cardano.AssetName(`${PREFIX_222}${requested_handle}` as HexBlob),
      );
      mint.set(refAssetId, 1n);
      mint.set(userAssetId, 1n);
      newOutputs.push({
        address: pzAddress,
        value: { coins: 0n, assets: new Map([[refAssetId, 1n]]) },
      });
      newOutputs.push({
        address: destination_address as unknown as CardanoTypes.TxOut["address"],
        value: { coins: 0n, assets: new Map([[userAssetId, 1n]]) },
      });
    }
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

  return Ok({ plan: extendedPlan, deployedScripts, settingsV1, handlePriceInfo });
};

/**
 * Mint new handles by consuming `ordersTxInputs` and finalizing to unsigned CBOR. Thin wrapper over
 * `buildMintDeMiHandlesPlan` — callers that need to inject fee outputs / tx metadata should use
 * `buildMintDeMiHandlesPlan` directly and run their own finalize.
 */
const mintNewHandles = async (
  params: MintDeMiHandlesParams,
): Promise<Result<FinalizedTx, Error>> => {
  const planResult = await buildMintDeMiHandlesPlan(params);
  if (!planResult.ok) return Err(planResult.error);
  return Ok(await finalizeTxPlan(planResult.data.plan));
};

const coreInlineDatumToCbor = (
  datum: CardanoTypes.TxOut["datum"],
): string | undefined => {
  if (!datum) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Serialization as any).PlutusData.fromCore(datum).toCbor() as string;
};

export type { MintDeMiHandlesParams };
export { buildMintDeMiHandlesPlan, mintNewHandles };
