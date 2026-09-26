import type { Cardano as CardanoTypes } from "@cardano-sdk/core";
import type { HexBlob } from "@cardano-sdk/util";

import { Cardano, Serialization } from "./index.js";

type PaymentAddress = CardanoTypes.TxOut["address"];

interface BlockfrostUtxoItem {
  tx_hash: string;
  tx_index: number;
  output_index: number;
  amount: { unit: string; quantity: string }[];
  block: string;
  data_hash: string | null;
  inline_datum: string | null;
  reference_script_hash: string | null;
}

const parseBlockfrostValue = (
  amounts: { unit: string; quantity: string }[],
): CardanoTypes.Value => {
  let coins = 0n;
  const assets = new Map<CardanoTypes.AssetId, bigint>();

  for (const { unit, quantity } of amounts) {
    if (unit === "lovelace") {
      coins = BigInt(quantity);
    } else {
      const policyId = unit.slice(0, 56);
      const assetName = unit.slice(56);
      const assetId = Cardano.AssetId.fromParts(
        Cardano.PolicyId(policyId as HexBlob),
        Cardano.AssetName(assetName as HexBlob),
      );
      assets.set(assetId, BigInt(quantity));
    }
  }

  return { coins, ...(assets.size > 0 ? { assets } : {}) };
};

const blockfrostUtxoToCore = (
  item: BlockfrostUtxoItem,
  address: string,
): CardanoTypes.Utxo => {
  const txIn: CardanoTypes.HydratedTxIn = {
    txId: Cardano.TransactionId(item.tx_hash as HexBlob),
    index: item.output_index,
    address: address as PaymentAddress,
  };
  const txOut: CardanoTypes.TxOut = {
    address: address as PaymentAddress,
    value: parseBlockfrostValue(item.amount),
    ...(item.inline_datum
      ? { datum: Serialization.PlutusData.fromCbor(item.inline_datum as HexBlob).toCore() }
      : {}),
  };
  return [txIn, txOut];
};

// Projected ledger: transactions that are built (and possibly signed) but not yet on chain. A plan
// built on top of them must neither re-spend their inputs nor miss their outputs — e.g. a mainnet
// deploy batch co-signed together with other pending multisig txs, or a plan's own earlier txs.
const projectedSpent = new Set<string>();
const projectedCreated: CardanoTypes.Utxo[] = [];
const refOf = (txIn: { txId: string; index: number }) => `${txIn.txId}#${txIn.index}`;

export const projectPendingTransaction = (cborHex: string): string => {
  const tx = Serialization.Transaction.fromCbor(cborHex.trim() as unknown as HexBlob as never);
  const txId = tx.getId();
  const body = tx.toCore().body;
  for (const input of body.inputs) projectedSpent.add(refOf(input));
  body.outputs.forEach((output, index) =>
    projectedCreated.push([{ txId, index, address: output.address }, output]),
  );
  return txId;
};

export const resetProjectedLedger = () => {
  projectedSpent.clear();
  projectedCreated.length = 0;
};

export interface FetchBlockfrostUtxosOptions {
  excludeWithReferenceScripts?: boolean;
}

export const fetchBlockfrostUtxos = async (
  address: string,
  apiKey: string,
  network: "preview" | "preprod" | "mainnet",
  fetchFn: typeof fetch = fetch,
  options: FetchBlockfrostUtxosOptions = {},
): Promise<CardanoTypes.Utxo[]> => {
  const host = `https://cardano-${network}.blockfrost.io/api/v0`;
  const allUtxos: CardanoTypes.Utxo[] = [];
  let page = 1;

  while (true) {
    const response = await fetchFn(
      `${host}/addresses/${address}/utxos?page=${page}&count=100`,
      { headers: { "Content-Type": "application/json", project_id: apiKey } },
    );
    if (response.status === 404) break;
    if (!response.ok) {
      throw new Error(`Blockfrost UTxO fetch: HTTP ${response.status}`);
    }
    const items = (await response.json()) as BlockfrostUtxoItem[];
    if (items.length === 0) break;
    for (const item of items) {
      if (options.excludeWithReferenceScripts && item.reference_script_hash) continue;
      allUtxos.push(blockfrostUtxoToCore(item, address));
    }
    if (items.length < 100) break;
    page += 1;
  }

  const projected = projectedCreated.filter(
    ([txIn, txOut]) =>
      txIn.address === address && !(options.excludeWithReferenceScripts && txOut.scriptReference),
  );
  return [...allUtxos, ...projected].filter(([txIn]) => !projectedSpent.has(refOf(txIn)));
};
