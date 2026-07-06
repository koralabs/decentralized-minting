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
import { execSync } from "child_process";

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

    // Scope 18 runs LAST, right after scope 22's DeMi mint churn. Must (a) PAGINATE
    // — a single ?page=1 truncates at 100 UTxOs and can miss every ADA-only one when
    // the wallet holds >100 handle UTxOs; and (b) RETRY — the change UTxOs from the
    // preceding scope may not be blockfrost-indexed yet (surfaces as "have 0").
    const need1 = ORDER_LOVELACE + FEE1 + 2_000_000n;
    const chosen: any[] = []; let sum = 0n;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const rawUtxos: any[] = [];
      for (let pg = 1; ; pg++) {
        const batch = await bfj(`addresses/${ADDRESS}/utxos?count=100&page=${pg}`);
        rawUtxos.push(...batch);
        if (batch.length < 100) break;
      }
      const adaOnly = rawUtxos
        .filter((u: any) => u.amount.length === 1 && u.amount[0].unit === "lovelace")
        .sort((a: any, b: any) => Number(BigInt(b.amount[0].quantity) - BigInt(a.amount[0].quantity)));
      chosen.length = 0; sum = 0n;
      for (const u of adaOnly) { chosen.push(u); sum += BigInt(u.amount[0].quantity); if (sum >= need1) break; }
      if (sum >= need1) break;
      if (attempt === 5) throw new Error(`insufficient ADA-only UTxOs for order after retries: have ${sum}, need ${need1} (adaOnly=${adaOnly.length}, total=${rawUtxos.length})`);
      console.error(`PHASE 1: insufficient ADA-only UTxOs (have ${sum}, need ${need1}, adaOnly=${adaOnly.length}/${rawUtxos.length}) — indexing lag, re-fetching (attempt ${attempt}/5)`);
      await sleep(8000);
    }

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

  // Resolve the demiord reference-script UTxO FRESH and validate it is actually
  // on-chain. Root cause of the scope-18 flake (proven by DIAG across a failing
  // full run): the api's /scripts (services/scripts.service.ts:178 → handle.utxo
  // of demiord1@handlecontract) transiently serves a rolled-back ref UTxO under
  // full-suite load — e.g. edc125…#0, which is 404 on-chain — and self-heals in
  // seconds; both boxes' Valkey store holds the correct be0bbbf6…#0. A tx that
  // references a non-existent input is malformed by construction, so we must NOT
  // build one: re-resolve per attempt and skip any phantom ref until the api
  // settles. (Fixes the real retry-loop bug: it re-fetched wallet UTxOs every
  // attempt but reused a single, once-fetched ref — so one bad fetch poisoned all
  // retries.) Any production demiord consumer must validate the ref the same way.
  type Ref = { txHash: string; outputIndex: number };
  // Fresh-connection resolve: curl with `Connection: close` opens a NEW TCP conn,
  // re-rolling the Cloudflare origin. If the api's transient phantom ref is
  // per-origin (undici/keep-alive pinned the app's pool to a stale origin for the
  // ~2-min window), a fresh conn escapes to the good origin immediately.
  const refFresh = (): Ref | null => {
    try {
      const out = execSync(
        `curl -s --max-time 8 -H 'Connection: close' '${apiBase(NETWORK)}/scripts?latest=true&type=demiord'`,
        { encoding: "utf8" }
      );
      const m = out.match(/"refScriptUtxo":"([0-9a-f]{64})#(\d+)"/);
      return m ? { txHash: m[1], outputIndex: parseInt(m[2], 10) } : null;
    } catch { return null; }
  };
  // Pinned resolve: the app's own fetch (undici pool) — what the bug actually hit.
  const refPinned = async (): Promise<Ref | null> => {
    const s = await fetchAllDeployedScripts();
    if (!s.ok) return null;
    const r = (s.data as any).ordersScript?.refScriptUtxo;
    return r?.txHash ? r : null;
  };
  const onChain = async (h: string) => (await bf(`txs/${h}`)).ok;
  const resolveValidRef = async (): Promise<Ref | null> => {
    const fresh = refFresh();
    const pinned = await refPinned();
    // DIAGNOSTIC: if the two disagree, the phantom is PER-ORIGIN (pool pinning),
    // not a global api outage — the definitive discriminator.
    if (fresh && pinned && fresh.txHash !== pinned.txHash) {
      console.error(`REFCMP DISAGREE: pinned=${pinned.txHash.slice(0, 12)}#${pinned.outputIndex} fresh=${fresh.txHash.slice(0, 12)}#${fresh.outputIndex}`);
    }
    // Prefer the fresh-connection ref (escapes a pinned stale origin); a tx must
    // never reference a non-existent input, so require on-chain existence.
    for (const cand of [fresh, pinned]) {
      if (cand?.txHash && (await onChain(cand.txHash))) return cand;
    }
    return null;
  };

  let orderUtxo: any;
  for (let i = 0; i < 18 && !orderUtxo; i++) {
    const ordersRes = await fetchOrdersTxInputs({ network: NETWORK, ordersScriptDetail: { validatorHash } as any, blockfrostApiKey: BF });
    if (!ordersRes.ok) throw new Error(`fetchOrdersTxInputs failed: ${(ordersRes as any).error?.message}`);
    orderUtxo = ordersRes.data.find((u: any) => String(u[0].txId) === orderTxHash && Number(u[0].index) === 0);
    if (!orderUtxo) await sleep(5000);
  }
  if (!orderUtxo) throw new Error(`order UTxO ${orderTxHash}#0 never appeared at demiord (blockfrost index lag)`);

  // The cancel spends the order UTxO + one wallet collateral. Under the heavy
  // wallet-UTxO churn at the tail of a full suite run, the collateral/spare
  // selection can pick a UTxO that a concurrent tx (or a transient blockfrost
  // mempool view) invalidates before submit — surfacing as BadInputsUTxO on a
  // phantom input (with cascading ExtraRedeemers / ScriptIntegrityHashMismatch).
  // The order UTxO stays valid until the cancel actually lands, so re-fetch fresh
  // wallet UTxOs + rebuild on a transient submit failure. Runs clean on the first
  // attempt in isolation; the retry only fires under churn.
  let cancelTxHash: string | undefined;
  // A persistent phantom (e.g. edc125…#0) can be listed by blockfrost as an unspent
  // [2,4] ADA UTxO while the ledger rejects it (BadInputsUTxO). It sorts smallest, so
  // the naive "pick smallest" re-selects it on every retry and never converges. Track
  // any collateral whose submit the ledger rejected and skip it next attempt so the
  // retry advances to a genuinely-spendable UTxO.
  const failedCollateral = new Set<string>();
  for (let attempt = 1; attempt <= 8 && !cancelTxHash; attempt++) {
    // Re-resolve the ref FRESH each attempt; wait out any transient api phantom
    // so every real submit attempt references an on-chain demiord ref.
    let refUtxo = await resolveValidRef();
    for (let r = 0; r < 18 && !refUtxo; r++) {
      console.error(`PHASE 2: demiord ref not yet valid on-chain (api phantom/404, both fresh+pinned) — waiting for the api to settle (${r + 1}/18)`);
      await sleep(10000);
      refUtxo = await resolveValidRef();
    }
    if (!refUtxo) throw new Error("demiord ref never resolved to an on-chain UTxO (api served a phantom for >180s on BOTH fresh + pinned connections)");
    const walletCoreUtxos = await fetchBlockfrostUtxos(ADDRESS, BF, NETWORK, fetch as any);
    const collateral = walletCoreUtxos
      .filter((u: any) => (!u[1].value.assets || u[1].value.assets.size === 0) && u[1].value.coins >= 2_000_000n && u[1].value.coins <= 4_000_000n && String(u[0].txId) !== orderTxHash && !failedCollateral.has(`${u[0].txId}#${u[0].index}`))
      .sort((a: any, b: any) => Number(a[1].value.coins - b[1].value.coins))[0];
    if (!collateral) throw new Error("no small ADA-only UTxO in [2,4] ADA for collateral (after excluding rejected)");

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
    // DIAG: dump exactly where each hash sits (spend inputs vs collateral vs reference inputs)
    // so a BadInputsUTxO phantom can be attributed to its real role, not theorized.
    {
      const fb: any = Serialization.Transaction.fromCbor(signedCancel.toCbor()).toCore().body;
      const J = (x: any) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
      console.error(
        `DIAG a${attempt}: refUtxo=${refUtxo.txHash.slice(0, 12)}#${refUtxo.outputIndex}` +
        ` | chosenCollat=${String(collateral[0].txId).slice(0, 12)}#${collateral[0].index}` +
        ` | order=${orderTxHash.slice(0, 12)}` +
        ` | inputs=${J((fb.inputs || []).map((i: any) => `${String(i.txId).slice(0, 12)}#${i.index}`))}` +
        ` | collaterals=${J((fb.collaterals || []).map((i: any) => `${String(i.txId).slice(0, 12)}#${i.index}`))}` +
        ` | refInputs=${J((fb.referenceInputs || []).map((i: any) => `${String(i.txId).slice(0, 12)}#${i.index}`))}`
      );
    }
    try {
      cancelTxHash = await submitTx(signedCancel.toCbor() as string);
    } catch (e: any) {
      // The submit was rejected — the chosen collateral is (or behaves as) a phantom.
      // Exclude it so the next attempt selects a different UTxO instead of re-picking it.
      failedCollateral.add(`${collateral[0].txId}#${collateral[0].index}`);
      if (attempt === 8) throw e;
      console.error(`PHASE 2: cancel submit failed (attempt ${attempt}/8, collateral ${String(collateral[0].txId).slice(0, 12)}#${collateral[0].index} excluded) — ${String(e?.message ?? e).slice(0, 120)}; re-fetching + rebuilding`);
      await sleep(8000);
    }
  }
  if (!cancelTxHash) throw new Error("cancel never submitted after retries");
  console.error(`PHASE 2: cancel submitted → ${cancelTxHash}`);
  await waitConfirm(cancelTxHash, "cancel");

  const refundLovelace = (orderUtxo[1].value.coins - CANCEL_FEE).toString();
  console.log(`SCOPE18_RESULT=${JSON.stringify({ orderTxHash, cancelTxHash, refundLovelace, owner: ADDRESS })}`);
};

main().catch((e) => { console.error("SCOPE18_ERROR:", e instanceof Error ? e.stack : e); process.exit(1); });
