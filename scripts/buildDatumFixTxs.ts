/**
 * Build two transactions to fix missing datums on preprod:
 * 1. kora@handle_prices - add prices inline datum (signed with POLICY_KEY derivation 12)
 * 2. pfp_policy_ids - add policy IDs inline datum (needs multi-sig native script)
 */
import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import { fetch } from "cross-fetch";

import {
  makeAddress,
  makeInlineTxOutputDatum,
  makeTxInput,
  makeTxOutput,
  makeValue,
  makeSignature,
} from "@helios-lang/ledger";
import { makeTxBuilder, makeBlockfrostV0Client } from "@helios-lang/tx-utils";
import {
  makeConstrData,
  makeIntData,
  makeListData,
  decodeUplcData,
} from "@helios-lang/uplc";
import { bytesToHex } from "@helios-lang/codec-utils";

const NETWORK = "preprod";
const API_BASE = "https://preprod.api.handle.me";

const BLOCKFROST_API_KEY = process.env.BLOCKFROST_API_KEY || "preprodotVbkm22Jjy5WZ2Z0Q6GOZZ4zMaUIUeC";
const NATIVE_SCRIPT_CBOR = process.env.HANDLECONTRACT_NATIVE_SCRIPT_CBOR ||
  "8202828200581c5b468ea6affe46ae95b2f39e8aaf9141c17f1beb7f575ba818cf1a8b8200581c548afd43158ec53fcd94290c41d1b4496c0746617f0efbb974440bb4";

const fetchHandle = async (handleName: string) => {
  const res = await fetch(`${API_BASE}/handles/${encodeURIComponent(handleName)}`);
  if (!res.ok) throw new Error(`failed to fetch ${handleName}: ${res.status}`);
  return res.json() as Promise<{ utxo: string; resolved_addresses: { ada: string }; has_datum: boolean }>;
};

const main = async () => {
  const outDir = process.argv[2] || "tmp/datum-fix";
  await fs.mkdir(outDir, { recursive: true });

  const blockfrost = makeBlockfrostV0Client(NETWORK, BLOCKFROST_API_KEY);

  // =========================================================================
  // TX 1: kora@handle_prices - add prices datum
  // =========================================================================
  console.log("Building kora@handle_prices datum fix tx...");

  const pricesHandle = await fetchHandle("kora@handle_prices");
  const pricesAddress = makeAddress(pricesHandle.resolved_addresses.ada);

  const allUtxos = await blockfrost.getUtxos(pricesAddress);
  console.log(`  Deployer wallet has ${allUtxos.length} UTxOs`);

  const pricesUtxo = allUtxos.find((u) => `${u.id.txId.toHex()}#${u.id.index}` === pricesHandle.utxo);
  if (!pricesUtxo) throw new Error(`kora@handle_prices UTxO ${pricesHandle.utxo} not found`);

  // Get current slot
  const tipRes = await fetch("https://preprod.koios.rest/api/v1/tip");
  const tipData = await tipRes.json() as Array<{ abs_slot: string }>;
  const currentSlot = parseInt(tipData[0].abs_slot, 10);
  console.log(`  Current slot: ${currentSlot}`);

  // Prices datum: Constr(0, [current_data, prev_data, updated_at])
  const pricesDatum = makeConstrData(0, [
    makeListData([makeIntData(785000000n), makeIntData(445000000n), makeIntData(120000000n), makeIntData(25000000n)]),
    makeListData([makeIntData(640000000n), makeIntData(320000000n), makeIntData(80000000n), makeIntData(10000000n)]),
    makeIntData(BigInt(currentSlot)),
  ]);

  const pricesTxBuilder = makeTxBuilder({ isMainnet: false });
  pricesTxBuilder.spendUnsafe(pricesUtxo);
  pricesTxBuilder.payUnsafe(
    pricesAddress,
    pricesUtxo.value,
    makeInlineTxOutputDatum(pricesDatum),
  );

  const spareUtxos = allUtxos.filter((u) => `${u.id.txId.toHex()}#${u.id.index}` !== pricesHandle.utxo);

  const pricesTx = await pricesTxBuilder.buildUnsafe({
    networkParams: blockfrost.parameters,
    changeAddress: pricesAddress,
    spareUtxos,
  });

  const pricesCbor = bytesToHex(pricesTx.toCbor());
  await fs.writeFile(`${outDir}/kora-prices-fix.cbor`, Buffer.from(pricesCbor, "hex"));
  await fs.writeFile(`${outDir}/kora-prices-fix.cbor.hex`, pricesCbor + "\n");
  console.log(`  Written: ${outDir}/kora-prices-fix.cbor (${Math.ceil(pricesCbor.length / 2)} bytes)`);

  // Sign with POLICY_KEY derivation 12 if available
  const policyKeyBech32 = (process.env.POLICY_KEY || "").replace(/'/g, "").trim();
  if (policyKeyBech32) {
    console.log("  Signing with POLICY_KEY derivation 12...");
    // Use the minting engine's derivation logic
    const { Bip32PrivateKey } = await import("@stricahq/bip32ed25519");
    const { decodeBech32 } = await import("@helios-lang/crypto");
    const [, keyBytes] = decodeBech32(policyKeyBech32);
    const rootKey = new Bip32PrivateKey(Buffer.from(keyBytes));
    const accountKey = rootKey
      .derive(2147483648 + 1852)
      .derive(2147483648 + 1815)
      .derive(2147483648 + 0);
    const privKey = accountKey.derive(0).derive(12).toPrivateKey();

    // Verify address matches
    const { makePubKeyHash } = await import("@helios-lang/ledger");
    const pubKeyBytes = privKey.toPublicKey().toBytes();
    const pubKeyHash = privKey.toPublicKey().hash();
    const derivedAddress = makeAddress(false, makePubKeyHash(pubKeyHash.toString("hex")));
    console.log(`  Derived address: ${derivedAddress.toBech32()}`);
    console.log(`  Expected address: ${pricesHandle.resolved_addresses.ada}`);

    if (derivedAddress.toBech32() === pricesHandle.resolved_addresses.ada) {
      const txId = pricesTx.id();
      const txHashBytes = txId.bytes;
      const sigBytes = privKey.sign(Buffer.from(txHashBytes));
      const signature = makeSignature(
        Array.from(pubKeyBytes),
        Array.from(sigBytes),
      );
      pricesTx.addSignature(signature);

      const signedCbor = bytesToHex(pricesTx.toCbor());
      await fs.writeFile(`${outDir}/kora-prices-fix-signed.cbor`, Buffer.from(signedCbor, "hex"));
      await fs.writeFile(`${outDir}/kora-prices-fix-signed.cbor.hex`, signedCbor + "\n");
      console.log(`  Written signed tx: ${outDir}/kora-prices-fix-signed.cbor`);
      console.log(`  TxHash: ${txId.toHex()}`);

      // Submit
      if (process.argv.includes("--submit")) {
        console.log("  Submitting...");
        await blockfrost.submitTx(pricesTx);
        console.log(`  Submitted!`);
      }
    } else {
      console.log("  Address mismatch! Not signing.");
    }
  } else {
    console.log("  No POLICY_KEY - tx must be signed externally");
  }

  // =========================================================================
  // TX 2: pfp_policy_ids - add policy IDs datum (same as bg_policy_ids)
  // =========================================================================
  console.log("\nBuilding pfp_policy_ids datum fix tx...");

  const pfpHandle = await fetchHandle("pfp_policy_ids");
  const pfpAddress = makeAddress(pfpHandle.resolved_addresses.ada);

  // Get bg_policy_ids datum to reuse
  const bgDatumRes = await fetch(`${API_BASE}/handles/bg_policy_ids/datum`);
  const bgDatumHex = (await bgDatumRes.text()).trim();
  console.log(`  Using bg_policy_ids datum (${bgDatumHex.length / 2} bytes)`);
  const pfpDatumData = decodeUplcData(Buffer.from(bgDatumHex, "hex"));

  // Get UTxOs at the script address
  const pfpAllUtxos = await blockfrost.getUtxos(pfpAddress);
  const pfpUtxo = pfpAllUtxos.find((u) => `${u.id.txId.toHex()}#${u.id.index}` === pfpHandle.utxo);
  if (!pfpUtxo) throw new Error(`pfp_policy_ids UTxO ${pfpHandle.utxo} not found`);

  // Parse and attach the native script so helios knows how to spend from the script address
  const { Serialization } = await import("../src/helpers/cardano-sdk/index.js");
  const nativeScriptCbor = NATIVE_SCRIPT_CBOR;
  // Decode the native script CBOR to get the script hash, then use helios native script
  const { decodeNativeScript } = await import("@helios-lang/ledger");
  const nativeScript = decodeNativeScript(Buffer.from(nativeScriptCbor, "hex"));

  const pfpTxBuilder = makeTxBuilder({ isMainnet: false });
  pfpTxBuilder.attachNativeScript(nativeScript);
  pfpTxBuilder.spendUnsafe(pfpUtxo);
  pfpTxBuilder.payUnsafe(
    pfpAddress,
    pfpUtxo.value,
    makeInlineTxOutputDatum(pfpDatumData),
  );

  // Clean UTxOs for fees (no tokens)
  const pfpSpareUtxos = pfpAllUtxos.filter((u) => {
    if (`${u.id.txId.toHex()}#${u.id.index}` === pfpHandle.utxo) return false;
    return u.value.assets.isZero();
  });

  const pfpTx = await pfpTxBuilder.buildUnsafe({
    networkParams: blockfrost.parameters,
    changeAddress: pfpAddress,
    spareUtxos: pfpSpareUtxos,
    allowDirtyChangeOutput: true,
  });

  const pfpCbor = bytesToHex(pfpTx.toCbor());
  await fs.writeFile(`${outDir}/pfp-policy-ids-fix.cbor`, Buffer.from(pfpCbor, "hex"));
  await fs.writeFile(`${outDir}/pfp-policy-ids-fix.cbor.hex`, pfpCbor + "\n");
  console.log(`  Written: ${outDir}/pfp-policy-ids-fix.cbor (${Math.ceil(pfpCbor.length / 2)} bytes)`);
  console.log("  This tx needs multi-sig native script signing in Eternl");

  console.log("\nDone.");
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
