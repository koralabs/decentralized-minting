import { Buffer } from "node:buffer";

import type { Cardano as CardanoTypes } from "@cardano-sdk/core";
import type { Ed25519KeyHashHex } from "@cardano-sdk/crypto";
import {
  roundRobinRandomImprove,
  type SelectionSkeleton,
} from "@cardano-sdk/input-selection";
import {
  computeMinimumCoinQuantity,
  createTransactionInternals,
  defaultSelectionConstraints,
  GreedyTxEvaluator,
} from "@cardano-sdk/tx-construction";

import type { BlockfrostBuildContext } from "../helpers/cardano-sdk/blockfrostContext.js";
import {
  asPaymentAddress,
  buildPlaceholderSignatures,
  computeScriptDataHash,
  type HexBlob,
  Serialization,
  transactionHashFromCore,
  transactionToCbor,
} from "../helpers/cardano-sdk/index.js";

/**
 * Shared Plutus-tx spec used by the DeMi tx builders. A `TxPlan` captures
 * all the declarative intent of a tx — inputs, outputs, redeemers, mints,
 * withdrawals, reference inputs — and `finalizeTxPlan` runs coin selection,
 * Conway-correct script_data_hash computation, and CBOR serialization.
 *
 * Callers never touch `@helios-lang/*`. They never touch cardano-sdk's
 * broken Alonzo-array-format script_data_hash either — this helper uses
 * the ported MAP-format `computeScriptDataHash` under the hood.
 */
export interface TxPlan {
  /** Preselected UTxOs (contract spends + token-carrying wallet UTxOs). */
  preSelectedUtxos: CardanoTypes.Utxo[];
  /** Additional wallet UTxOs to cover fees. */
  spareUtxos: CardanoTypes.Utxo[];
  /** Required outputs. Coin values are pre-filled; the selector may add change. */
  outputs: CardanoTypes.TxOut[];
  /** Reference inputs (script refs + reference datums). */
  referenceInputs?: Set<CardanoTypes.TxIn>;
  /** Tokens minted/burned keyed by asset id. */
  mint?: Map<CardanoTypes.AssetId, bigint>;
  /** Withdrawals keyed by reward account (bech32). */
  withdrawals?: Map<CardanoTypes.RewardAccount, bigint>;
  /** Certificates (stake registration, etc). */
  certificates?: CardanoTypes.Certificate[];
  /** All redeemers (spend/mint/cert/withdraw). */
  redeemers?: CardanoTypes.Redeemer[];
  /** Required ed25519 key-hash signers in addition to wallet signers. */
  requiredSigners?: Ed25519KeyHashHex[];
  /** Plutus language versions actually used in this tx. */
  usedPlutusVersions?: CardanoTypes.PlutusLanguageVersion[];
  /** Collateral UTxO(s) for Plutus-spending txs. */
  collateralUtxo?: CardanoTypes.Utxo;
  /** Change address (bech32). Defaults to the first wallet UTxO's address. */
  changeAddress: string;
  /** Blockfrost build context (protocol params + validity interval). */
  buildContext: BlockfrostBuildContext;
  /** Optional pre-computed datums attached in the witness set (non-inline). */
  datums?: CardanoTypes.PlutusData[];
}

export interface FinalizedTx {
  /** Unsigned tx CBOR hex. */
  cborHex: string;
  /** txHash (matches body hash). */
  txHash: string;
  /** UTxO refs consumed as inputs. */
  consumedInputs: Set<string>;
  /** Estimated signed tx size in bytes. */
  estimatedSignedTxSize: number;
}

const DUMMY_SCRIPT_DATA_HASH = "0".repeat(64);
const toUtxoRef = (utxo: CardanoTypes.Utxo): string =>
  `${utxo[0].txId}#${utxo[0].index}`;

const toCollateralTxIn = (u: CardanoTypes.Utxo): CardanoTypes.TxIn => ({
  txId: u[0].txId,
  index: u[0].index,
});

/**
 * Plug a provisional tx body shape into `createTransactionInternals` using
 * the given selection, then attach the Plutus fields needed for the Conway
 * witness set. Returns a full `CardanoTypes.Tx` with placeholder vkey
 * witnesses for accurate fee estimation.
 */
const buildTxForSelection = (
  selection: SelectionSkeleton,
  plan: TxPlan,
  scriptDataHash: string,
): CardanoTypes.Tx => {
   
  const bodyWithHash = createTransactionInternals({
    inputSelection: selection,
    validityInterval: plan.buildContext.validityInterval,
    outputs: plan.outputs,
    certificates: plan.certificates,
    withdrawals: plan.withdrawals,
    mint: plan.mint,
    referenceInputs: plan.referenceInputs,
    requiredExtraSignatures: plan.requiredSigners,
    collaterals: plan.collateralUtxo
      ? new Set<CardanoTypes.TxIn>([toCollateralTxIn(plan.collateralUtxo)])
      : undefined,
    scriptIntegrityHash: scriptDataHash as HexBlob,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const witness: CardanoTypes.Witness = {
    signatures: buildPlaceholderSignatures(
      (plan.requiredSigners?.length ?? 0) + 2,
    ),
    ...(plan.redeemers && plan.redeemers.length > 0
      ? { redeemers: plan.redeemers }
      : {}),
    ...(plan.datums && plan.datums.length > 0 ? { datums: plan.datums } : {}),
  };

  return {
    id: transactionHashFromCore({
      body: bodyWithHash.body,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any) as unknown as CardanoTypes.TransactionId,
    body: bodyWithHash.body,
    witness,
  };
};

export const finalizeTxPlan = async (plan: TxPlan): Promise<FinalizedTx> => {
  const changeAddressBech32 = asPaymentAddress(plan.changeAddress);
  const inputSelector = roundRobinRandomImprove({
    changeAddressResolver: {
      resolve: async (selection) =>
        selection.change.map((change) => ({
          ...change,
          address: changeAddressBech32,
        })),
    },
  });
  const txEvaluator = new GreedyTxEvaluator(
    async () => plan.buildContext.protocolParameters,
  );

  // Fill in minimum coin quantity for any output with 0 coins.
  const minimumCoinQuantity = computeMinimumCoinQuantity(
    plan.buildContext.protocolParameters.coinsPerUtxoByte,
  );
  const filledOutputs = plan.outputs.map((out) => {
    if (out.value.coins === 0n) {
      return { ...out, value: { ...out.value, coins: minimumCoinQuantity(out) } };
    }
    return out;
  });
  const planWithFilled: TxPlan = { ...plan, outputs: filledOutputs };

  const buildForSelection = (selection: SelectionSkeleton) =>
    Promise.resolve(
      buildTxForSelection(selection, planWithFilled, DUMMY_SCRIPT_DATA_HASH),
    );

  const selection = await inputSelector.select({
    preSelectedUtxo: new Set(planWithFilled.preSelectedUtxos),
    utxo: new Set(planWithFilled.spareUtxos),
    outputs: new Set(planWithFilled.outputs),
    constraints: defaultSelectionConstraints({
      protocolParameters: planWithFilled.buildContext.protocolParameters,
      buildTx: buildForSelection,
      redeemersByType: {},
      txEvaluator,
    }),
    ...(planWithFilled.mint ? { implicitValue: { mint: planWithFilled.mint } } : {}),
  });

  // Now compute the real Conway-correct script data hash using the actual
  // redeemers + cost models.
  const scriptDataHash = computeScriptDataHash(
    planWithFilled.buildContext.protocolParameters.costModels,
    planWithFilled.usedPlutusVersions ?? [],
    planWithFilled.redeemers,
    planWithFilled.datums,
  );

  const finalTx = buildTxForSelection(
    selection.selection,
    planWithFilled,
    scriptDataHash ?? DUMMY_SCRIPT_DATA_HASH,
  );

  // Strip placeholder signatures — we return unsigned.
  const unsignedTx: CardanoTypes.Tx = {
    ...finalTx,
    body: { ...finalTx.body, fee: selection.selection.fee },
    witness: {
      ...finalTx.witness,
      signatures: new Map(),
    },
  };

   
  const estimationTx = {
    ...unsignedTx,
    witness: {
      ...unsignedTx.witness,
      signatures: buildPlaceholderSignatures(
        (plan.requiredSigners?.length ?? 0) + 1,
      ),
    },
  };
  const estimatedSignedTxSize =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Serialization as any).Transaction.fromCore(estimationTx)
      .toCbor()
      .length / 2;

  const cborHex = transactionToCbor(unsignedTx);
  const txHash =
    typeof unsignedTx.id === "string"
      ? (unsignedTx.id as string)
      : Buffer.from(unsignedTx.id as unknown as Uint8Array).toString("hex");

  const consumedInputs = new Set<string>();
  for (const utxo of selection.selection.inputs) {
    consumedInputs.add(toUtxoRef(utxo));
  }

  return { cborHex, txHash, consumedInputs, estimatedSignedTxSize };
};
