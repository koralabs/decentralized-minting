/**
 * Build pfp_policy_ids datum fix tx using the same infrastructure as the deployment plan.
 * Uses @cardano-sdk for proper script address change handling.
 */
import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import { fetch } from "cross-fetch";

import type { Cardano as CardanoTypes } from "@cardano-sdk/core";
import type { HexBlob } from "@cardano-sdk/util";
import {
  computeMinimumCoinQuantity,
  createTransactionInternals,
  defaultSelectionConstraints,
  GreedyTxEvaluator,
} from "@cardano-sdk/tx-construction";
import { roundRobinRandomImprove } from "@cardano-sdk/input-selection";

import {
  asPaymentAddress,
  buildPlaceholderSignatures,
  Cardano,
  Serialization,
  transactionToCbor,
} from "../src/helpers/cardano-sdk/index.js";
import { getBlockfrostBuildContext } from "../src/helpers/cardano-sdk/blockfrostContext.js";
import { fetchBlockfrostUtxos } from "../src/helpers/cardano-sdk/blockfrostUtxo.js";
import { resolveHandleUtxo } from "../src/deploymentTx.js";

const NETWORK = "preprod";
const BLOCKFROST_API_KEY = process.env.BLOCKFROST_API_KEY || "preprodotVbkm22Jjy5WZ2Z0Q6GOZZ4zMaUIUeC";
const NATIVE_SCRIPT_CBOR = process.env.HANDLECONTRACT_NATIVE_SCRIPT_CBOR ||
  "8202828200581c5b468ea6affe46ae95b2f39e8aaf9141c17f1beb7f575ba818cf1a8b8200581c548afd43158ec53fcd94290c41d1b4496c0746617f0efbb974440bb4";
const LEGACY_POLICY_ID = "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";
const API_BASE = "https://preprod.api.handle.me";
const USER_AGENT = "datum-fix/1.0";

const main = async () => {
  const outDir = process.argv[2] || "tmp/datum-fix";
  await fs.mkdir(outDir, { recursive: true });

  console.log("Building pfp_policy_ids datum fix tx...");

  const buildContext = await getBlockfrostBuildContext(NETWORK, BLOCKFROST_API_KEY);

  // Get bg_policy_ids datum to reuse as pfp datum
  const bgDatumRes = await fetch(`${API_BASE}/handles/bg_policy_ids/datum`);
  const bgDatumHex = (await bgDatumRes.text()).trim();
  console.log(`  Using bg_policy_ids datum (${bgDatumHex.length / 2} bytes)`);
  const datum = Serialization.PlutusData.fromCbor(bgDatumHex as HexBlob).toCore();

  // Resolve the pfp handle UTxO
  const handleUtxo = await resolveHandleUtxo({
    network: NETWORK,
    handleName: "pfp_policy_ids",
    userAgent: USER_AGENT,
    blockfrostApiKey: BLOCKFROST_API_KEY,
  });
  const scriptAddress = handleUtxo[1].address;
  console.log(`  Script address: ${(scriptAddress as string).slice(0, 40)}...`);

  // Get all UTxOs at the script address (excluding ref scripts)
  const allScriptUtxos = await fetchBlockfrostUtxos(
    scriptAddress as string, BLOCKFROST_API_KEY, NETWORK, fetch,
    { excludeWithReferenceScripts: true },
  );
  console.log(`  Script address UTxOs (excl ref scripts): ${allScriptUtxos.length}`);

  // Build the handle asset
  const handleHex = Buffer.from("pfp_policy_ids", "utf8").toString("hex");
  const handleAssetId = Cardano.AssetId.fromParts(
    Cardano.PolicyId(LEGACY_POLICY_ID as HexBlob),
    Cardano.AssetName(`000de140${handleHex}` as HexBlob),
  );

  // Build the output with the same value but with inline datum
  const minimumCoinQuantity = computeMinimumCoinQuantity(buildContext.protocolParameters.coinsPerUtxoByte);
  const handleOutput: CardanoTypes.TxOut = {
    address: scriptAddress,
    value: {
      coins: 0n,
      assets: new Map([[handleAssetId, 1n]]),
    },
    datum,
  };
  handleOutput.value = {
    ...handleOutput.value,
    coins: minimumCoinQuantity(handleOutput),
  };
  console.log(`  Min coins for output with datum: ${handleOutput.value.coins}`);

  // Parse native script
  const nativeScript = Serialization.NativeScript.fromCbor(NATIVE_SCRIPT_CBOR as HexBlob).toCore();

  // Pre-select the handle UTxO; remaining clean UTxOs cover fees
  const handleUtxoRef = `${handleUtxo[0].txId}#${handleUtxo[0].index}`;
  const selectedUtxos = [handleUtxo];
  const remainingUtxos = allScriptUtxos.filter((u) => {
    const ref = `${u[0].txId}#${u[0].index}`;
    if (ref === handleUtxoRef) return false;
    const hasTokens = u[1].value.assets?.size ?? 0;
    return !hasTokens;
  });
  console.log(`  Clean fee UTxOs: ${remainingUtxos.length}`);

  // Coin selection
  const changeAddressBech32 = asPaymentAddress(scriptAddress as string);
  const inputSelector = roundRobinRandomImprove({
    changeAddressResolver: {
      resolve: async (selection) =>
        selection.change.map((change) => ({ ...change, address: changeAddressBech32 })),
    },
  });

  const requestedOutputs = [handleOutput];
  const txEvaluator = new GreedyTxEvaluator(async () => buildContext.protocolParameters);

  const buildForSelection = (selection: any) =>
    Promise.resolve(
      createTransactionInternals({
        inputSelection: selection,
        validityInterval: buildContext.validityInterval,
        outputs: requestedOutputs,
      } as any) as any
    ).then((bodyWithHash: any) => ({
      id: bodyWithHash.hash as CardanoTypes.TransactionId,
      body: bodyWithHash.body,
      witness: {
        signatures: buildPlaceholderSignatures(2),
        scripts: [nativeScript],
      },
    }));

  const selection = await inputSelector.select({
    preSelectedUtxo: new Set(selectedUtxos),
    utxo: new Set(remainingUtxos),
    outputs: new Set(requestedOutputs),
    constraints: defaultSelectionConstraints({
      protocolParameters: buildContext.protocolParameters,
      buildTx: buildForSelection,
      redeemersByType: {},
      txEvaluator,
    }),
  });

  // Build final tx
  const finalTxBodyWithHash = createTransactionInternals({
    inputSelection: selection.selection,
    validityInterval: buildContext.validityInterval,
    outputs: requestedOutputs,
  } as any);

  const unsignedTx: CardanoTypes.Tx = {
    id: (finalTxBodyWithHash as any).hash,
    body: { ...(finalTxBodyWithHash as any).body, fee: selection.selection.fee },
    witness: {
      signatures: new Map(),
      scripts: [nativeScript],
    },
  };

  const cborHex = transactionToCbor(unsignedTx);
  await fs.writeFile(`${outDir}/pfp-policy-ids-fix.cbor`, Buffer.from(cborHex, "hex"));
  await fs.writeFile(`${outDir}/pfp-policy-ids-fix.cbor.hex`, cborHex + "\n");
  console.log(`  Written: ${outDir}/pfp-policy-ids-fix.cbor (${Math.ceil(cborHex.length / 2)} bytes)`);
  console.log("  Sign with multi-sig native script in Eternl");
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
