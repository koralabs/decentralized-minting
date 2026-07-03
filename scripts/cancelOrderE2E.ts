/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * cancelOrderE2E.ts — place a never-mint-safe DeMi order and cancel it via the demiord
 * OrderRedeemer::Cancel path, proving the order-cancel+refund flow end-to-end on-chain.
 * This is the tx-building engine behind live-cip30 scope 18 (handle.me/static): the Playwright
 * scope spawns this script, then asserts the on-chain effect (order UTxO consumed + owner
 * refunded) itself via Blockfrost.
 *
 * Never-mint-safe: the order is funded UNDER the handle price (the governor's isValidOrderTxInput
 * rejects underfunded orders) AND placed for a TAKEN handle (can't be re-minted), so the governor
 * can never auto-execute it — it sits until we cancel it seconds later.
 *
 * Owner ABI: the order datum owner is a RAW payment key-hash ByteArray (via the fixed request()),
 * which is what the deployed demiord decodes (unBData) on the Cancel path. A Signature/MultisigScript
 * Constr owner would make the order permanently uncancelable — see reference_demi_order_owner_abi.
 *
 *   BLOCKFROST_API_KEY=preview... NETWORK=preview \
 *   E2E_LIVE_WALLET_MNEMONIC="..." E2E_LIVE_WALLET_ADDRESS=addr_test1... \
 *   npx tsx scripts/cancelOrderE2E.ts [takenHandle]
 *
 * On success prints a final line: SCOPE18_RESULT={"orderTxHash":"...","cancelTxHash":"...","refundLovelace":"..."}
 */
import { createRequire } from "module";

import { request, cancel, fetchOrdersTxInputs } from "../lib/txs/order.js";
import { fetchAllDeployedScripts } from "../lib/txs/deploy.js";
import { finalizeTxPlan } from "../lib/txs/txPlan.js";
import { getBlockfrostBuildContext } from "../lib/helpers/cardano-sdk/blockfrostContext.js";
import { fetchBlockfrostUtxos } from "../lib/helpers/cardano-sdk/blockfrostUtxo.js";
import { Cardano, Serialization } from "../lib/helpers/cardano-sdk/index.js";
import { plutusDataToCbor, buildOrderCancelRedeemer } from "../lib/contracts/index.js";
import { HexBlob } from "@cardano-sdk/util";

const require = createRequire(import.meta.url);

const NETWORK = (process.env.NETWORK || "preview") as any;
const BF = process.env.BLOCKFROST_API_KEY as string;
const MNEMONIC = process.env.E2E_LIVE_WALLET_MNEMONIC as string;
const ADDRESS = process.env.E2E_LIVE_WALLET_ADDRESS as string;
const TAKEN_HANDLE = process.argv[2] || "adahandle";
const HARDENED = 0x80000000;
const ORDER_LOVELACE = 5_000_000n; // underfunded vs any real price; covers fee+change on cancel
const FEE1 = 300_000n;
const CANCEL_FEE = 900_000n; // generous: covers base + ref-script + the declared ex-unit fee below
const EX_UNITS = { memory: 5_000_000, steps: 3_000_000_000 }; // demiord Cancel is a tiny sig check; bounded well under maxTxExUnits

const apiBase = (net: string) =>
  net === "mainnet" ? "https://api.handle.me" : `https://${net}.api.handle.me`;
const bf = (p: string) =>
  fetch(`https://cardano-${NETWORK}.blockfrost.io/api/v0/${p}`, { headers: { project_id: BF } });
const bfj = (p: string) => bf(p).then((r) => r.json());
const submitTx = async (cbor: string): Promise<string> => {
  const res = await fetch(`https://cardano-${NETWORK}.blockfrost.io/api/v0/tx/submit`, {
    method: "POST",
    headers: { project_id: BF, "Content-Type": "application/cbor" },
    body: Buffer.from(cbor, "hex") as any,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`submit ${res.status}: ${body}`);
  return body.replace(/^"|"$/g, "");
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitConfirm = async (h: string, label: string) => {
  for (let i = 0; i < 60; i++) {
    if ((await bf(`txs/${h}`)).ok) { console.error(`  ${label} confirmed (${h})`); return; }
    await sleep(5000);
  }
  throw new Error(`${label} ${h} not confirmed in 300s`);
};

const initCrypto = async () => {
  const nested = require.resolve("libsodium-wrappers-sumo", {
    paths: [require.resolve("@cardano-sdk/crypto").replace(/\/dist\/.*/, "")],
  });
  await require(nested).ready;
  const crypto = require("@cardano-sdk/crypto");
  const bip39 = require("bip39");
  try { require("@cardano-sdk/core/dist/cjs/util/conwayEra").setInConwayEra(true); } catch { /* noop */ }
  const entropy = bip39.mnemonicToEntropy(MNEMONIC);
  const root = crypto.Bip32PrivateKey.fromBip39Entropy(Buffer.from(entropy, "hex"), "");
  const account = root.derive([1852 + HARDENED, 1815 + HARDENED, 0 + HARDENED]);
  const paymentKey = account.derive([0, 0]).toRawKey();
  return { paymentKey, paymentPubKey: paymentKey.toPublic() };
};

const main = async () => {
  if (!BF || !MNEMONIC || !ADDRESS)
    throw new Error("BLOCKFROST_API_KEY + E2E_LIVE_WALLET_MNEMONIC + E2E_LIVE_WALLET_ADDRESS required");
  const { paymentKey, paymentPubKey } = await initCrypto();
  const keyHash = paymentPubKey.hash().hex() as string;

  // Sanity: TAKEN_HANDLE really is taken (governor can never mint it).
  const apiRes = await fetch(`${apiBase(NETWORK)}/handles/${TAKEN_HANDLE}`, { headers: { Accept: "application/json" } });
  if (!apiRes.ok) throw new Error(`TAKEN_HANDLE "${TAKEN_HANDLE}" is not taken on ${NETWORK} (HTTP ${apiRes.status})`);

  // ── PHASE 1: place the underfunded, raw-owner order ───────────────────
  let orderTxHash = process.env.SCOPE18_ORDER_TX as string | undefined;
  if (!orderTxHash) {
    const reqRes = await request({ network: NETWORK, address: ADDRESS, handle: TAKEN_HANDLE });
    if (!reqRes.ok) throw new Error(`request() failed: ${(reqRes as any).error?.message ?? (reqRes as any).error}`);
    const { scriptAddress, orderDatumCbor } = reqRes.data;
    // owner (field[0], right after the outer OrderDatum Constr d8799f) MUST be a raw keyhash ByteArray.
    if (orderDatumCbor.startsWith(`d8799fd8799f581c${keyHash}ff`))
      throw new Error("request() wrote a Signature-Constr owner — the order would be uncancelable (rebuild the package)");
    if (!orderDatumCbor.startsWith(`d8799f581c${keyHash}`))
      throw new Error(`order datum owner is not a raw keyhash: ${orderDatumCbor.slice(0, 20)}…`);

    const rawUtxos = await bfj(`addresses/${ADDRESS}/utxos?count=100&page=1`);
    const adaOnly = rawUtxos
      .filter((u: any) => u.amount.length === 1 && u.amount[0].unit === "lovelace")
      .sort((a: any, b: any) => Number(BigInt(b.amount[0].quantity) - BigInt(a.amount[0].quantity)));
    const need1 = ORDER_LOVELACE + FEE1 + 2_000_000n;
    const chosen: any[] = []; let sum = 0n;
    for (const u of adaOnly) { chosen.push(u); sum += BigInt(u.amount[0].quantity); if (sum >= need1) break; }
    if (sum < need1) throw new Error(`insufficient ADA-only UTxOs for order: have ${sum}, need ${need1}`);

    const orderOut = Serialization.TransactionOutput.fromCore({
      address: scriptAddress,
      value: { coins: ORDER_LOVELACE },
      datum: Serialization.PlutusData.fromCbor(HexBlob(orderDatumCbor)).toCore(),
    } as any).toCore();
    const changeOut = Serialization.TransactionOutput.fromCore({ address: ADDRESS, value: { coins: sum - ORDER_LOVELACE - FEE1 } } as any).toCore();
    const body1 = Serialization.TransactionBody.fromCore({
      inputs: chosen.map((u) => ({ txId: u.tx_hash, index: u.output_index })),
      outputs: [orderOut, changeOut], fee: FEE1, validityInterval: {},
    } as any);
    const ws1 = Serialization.TransactionWitnessSet.fromCore({ signatures: new Map([[paymentPubKey.hex(), paymentKey.sign(body1.hash() as any).hex()]]) } as any);
    orderTxHash = await submitTx(new Serialization.Transaction(body1, ws1).toCbor() as string);
    console.error(`PHASE 1: order placed → ${orderTxHash}`);
    await waitConfirm(orderTxHash, "order");
  }

  // ── PHASE 2: cancel it (single-input → spend redeemer at index 0) ─────
  const scripts = await fetchAllDeployedScripts();
  if (!scripts.ok) throw new Error(`fetchAllDeployedScripts failed: ${(scripts as any).error?.message}`);
  const ordersScript = (scripts.data as any).ordersScript;
  const validatorHash = ordersScript.details.validatorHash;
  const refUtxo = ordersScript.refScriptUtxo;

  let orderUtxo: any;
  for (let i = 0; i < 18 && !orderUtxo; i++) {
    const ordersRes = await fetchOrdersTxInputs({ network: NETWORK, ordersScriptDetail: { validatorHash } as any, blockfrostApiKey: BF });
    if (!ordersRes.ok) throw new Error(`fetchOrdersTxInputs failed: ${(ordersRes as any).error?.message}`);
    orderUtxo = ordersRes.data.find((u: any) => String(u[0].txId) === orderTxHash && Number(u[0].index) === 0);
    if (!orderUtxo) await sleep(5000);
  }
  if (!orderUtxo) throw new Error(`order UTxO ${orderTxHash}#0 never appeared at demiord (blockfrost index lag)`);

  const walletCoreUtxos = await fetchBlockfrostUtxos(ADDRESS, BF, NETWORK, fetch as any);
  const collateral = walletCoreUtxos
    .filter((u: any) => (!u[1].value.assets || u[1].value.assets.size === 0) && u[1].value.coins >= 2_000_000n && u[1].value.coins <= 4_000_000n && String(u[0].txId) !== orderTxHash)
    .sort((a: any, b: any) => Number(a[1].value.coins - b[1].value.coins))[0];
  if (!collateral) throw new Error("no small ADA-only UTxO in [2,4] ADA for collateral");

  const cancelRes = await cancel({ network: NETWORK, address: ADDRESS, orderUtxo, walletUtxos: walletCoreUtxos, collateralUtxo: collateral, blockfrostApiKey: BF, ordersScriptRef: { txHash: refUtxo.txHash, outputIndex: refUtxo.outputIndex } });
  if (!cancelRes.ok) throw new Error(`cancel() failed: ${(cancelRes as any).error?.message}`);
  if (cancelRes.data.requiredSignerHash !== keyHash) throw new Error(`owner mismatch: ${cancelRes.data.requiredSignerHash} vs ${keyHash}`);

  const redeemerCore = Serialization.PlutusData.fromCbor(HexBlob(plutusDataToCbor(buildOrderCancelRedeemer()))).toCore();
  const buildContext = await getBlockfrostBuildContext(NETWORK, BF);
  const referenceInputs = new Set([{ txId: Cardano.TransactionId(refUtxo.txHash), index: refUtxo.outputIndex }]);
  const plan: any = {
    preSelectedUtxos: [orderUtxo], spareUtxos: [], outputs: [],
    referenceInputs,
    redeemers: [{ data: redeemerCore, executionUnits: EX_UNITS, index: 0, purpose: Cardano.RedeemerPurpose.spend }],
    requiredSigners: [keyHash],
    usedPlutusVersions: [Cardano.PlutusLanguageVersion.V3],
    collateralUtxo: collateral, changeAddress: ADDRESS, buildContext,
  };
  const finalized = await finalizeTxPlan(plan);

  // Post-patch: finalizeTxPlan's collateral-return fee-nudge over-declares fee + its min-fee omits
  // the ref-script cost. script_data_hash does NOT cover fee/outputs, so rebuild the body with a
  // clean fee + balanced change + no collateral return (single 5-ADA input covers it).
  const utx = Serialization.Transaction.fromCbor(HexBlob(finalized.cborHex));
  const core = utx.toCore() as any;
  if (core.body.outputs.length !== 1) throw new Error(`expected 1 change output, got ${core.body.outputs.length}`);
  core.body.outputs[0] = { ...core.body.outputs[0], value: { coins: orderUtxo[1].value.coins - CANCEL_FEE } };
  core.body.fee = CANCEL_FEE;
  delete core.body.collateralReturn;
  delete core.body.totalCollateral;
  const cbody = Serialization.TransactionBody.fromCore(core.body);
  const wcore = utx.witnessSet().toCore() as any;
  wcore.signatures = new Map([...(wcore.signatures ?? []), [paymentPubKey.hex(), paymentKey.sign(cbody.hash() as any).hex()]]);
  const signedCancel = new Serialization.Transaction(cbody, Serialization.TransactionWitnessSet.fromCore(wcore), utx.auxiliaryData());
  const cancelTxHash = await submitTx(signedCancel.toCbor() as string);
  console.error(`PHASE 2: cancel submitted → ${cancelTxHash}`);
  await waitConfirm(cancelTxHash, "cancel");

  const refundLovelace = (orderUtxo[1].value.coins - CANCEL_FEE).toString();
  console.log(`SCOPE18_RESULT=${JSON.stringify({ orderTxHash, cancelTxHash, refundLovelace, owner: ADDRESS })}`);
};

main().catch((e) => { console.error("SCOPE18_ERROR:", e instanceof Error ? e.stack : e); process.exit(1); });
