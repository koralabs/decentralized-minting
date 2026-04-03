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

export const fetchBlockfrostUtxos = async (
  address: string,
  apiKey: string,
  network: "preview" | "preprod" | "mainnet",
  fetchFn: typeof fetch = fetch,
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
      allUtxos.push(blockfrostUtxoToCore(item, address));
    }
    if (items.length < 100) break;
    page += 1;
  }

  return allUtxos;
};
