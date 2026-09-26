// A plan built on pending (not yet on-chain) txs must never re-spend their inputs and must be able to
// spend their outputs. Mainnet 2026-09-26: the DeMi deploy plan picked a multisig UTxO already spent by
// a co-signed pending persprx tx. Only the network (Blockfrost) is faked.
import { afterEach, describe, expect, test } from "vitest";

import { Cardano, Serialization } from "../src/helpers/cardano-sdk/index.js";
import {
  fetchBlockfrostUtxos,
  projectPendingTransaction,
  resetProjectedLedger,
} from "../src/helpers/cardano-sdk/blockfrostUtxo.js";

const ADDRESS = "addr_test1vqwg4hlph5k947cqt88xlryxk6ufl9qymac33dr4aenmhrqgs8ql0";
const OTHER = "addr_test1wpaqgcq0y2n3q8426h7msmg2j8rchawgav57seuehk5rpmgk7222u";
const onChain = [
  { tx_hash: "aa".repeat(32), output_index: 0, tx_index: 0, amount: [{ unit: "lovelace", quantity: "5000000" }], block: "", data_hash: null, inline_datum: null, reference_script_hash: null },
  { tx_hash: "bb".repeat(32), output_index: 1, tx_index: 1, amount: [{ unit: "lovelace", quantity: "7000000" }], block: "", data_hash: null, inline_datum: null, reference_script_hash: null },
];
const blockfrost = (async () => new Response(JSON.stringify(onChain), { status: 200 })) as unknown as typeof fetch;

// A pending tx: spends aa#0, pays 3 ADA back to ADDRESS (change) and 1.5 ADA elsewhere.
const pendingTxHex = Serialization.Transaction.fromCore({
  id: "00".repeat(32) as Cardano.TransactionId,
  body: {
    inputs: [{ txId: Cardano.TransactionId("aa".repeat(32)), index: 0 }],
    outputs: [
      { address: Cardano.PaymentAddress(OTHER), value: { coins: 1_500_000n } },
      { address: Cardano.PaymentAddress(ADDRESS), value: { coins: 3_000_000n } },
    ],
    fee: 500_000n,
  },
  witness: { signatures: new Map() },
} as unknown as Cardano.Tx).toCbor();

const refs = (utxos: Cardano.Utxo[]) => utxos.map(([txIn, txOut]) => `${txIn.txId.slice(0, 4)}#${txIn.index}:${txOut.value.coins}`);

describe("projected ledger", () => {
  afterEach(() => resetProjectedLedger());

  test("pending txs remove the inputs they spend and add their outputs at the queried address", async () => {
    const pendingId = projectPendingTransaction(pendingTxHex);
    const utxos = await fetchBlockfrostUtxos(ADDRESS, "k", "preview", blockfrost);
    expect(refs(utxos)).toEqual(["bbbb#1:7000000", `${pendingId.slice(0, 4)}#1:3000000`]);
  });

  test("without a projection the chain view is returned unchanged (negative control)", async () => {
    const utxos = await fetchBlockfrostUtxos(ADDRESS, "k", "preview", blockfrost);
    expect(refs(utxos)).toEqual(["aaaa#0:5000000", "bbbb#1:7000000"]);
  });

  test("a later pending tx that spends an earlier one's output removes it (chaining)", async () => {
    const firstId = projectPendingTransaction(pendingTxHex);
    const second = Serialization.Transaction.fromCbor(pendingTxHex as unknown as Serialization.TxCBOR).toCore();
    second.body.inputs = [{ txId: Cardano.TransactionId(firstId), index: 1 }];
    second.body.outputs = [{ address: Cardano.PaymentAddress(OTHER), value: { coins: 2_500_000n } }];
    projectPendingTransaction(Serialization.Transaction.fromCore(second).toCbor());
    const utxos = await fetchBlockfrostUtxos(ADDRESS, "k", "preview", blockfrost);
    expect(refs(utxos)).toEqual(["bbbb#1:7000000"]);
  });
});
