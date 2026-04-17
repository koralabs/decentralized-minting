import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import Bip32Ed25519 from "@stricahq/bip32ed25519";
const { Bip32PrivateKey } = Bip32Ed25519;
import { decodeBech32 } from "@helios-lang/crypto";
import { makeSignature } from "@helios-lang/ledger";
import { makeBlockfrostV0Client } from "@helios-lang/tx-utils";
import { bytesToHex } from "@helios-lang/codec-utils";
import { decodeTx } from "@helios-lang/ledger";

const main = async () => {
  const policyKey = (process.env.POLICY_KEY || "").replace(/'/g, "").trim();
  const blockfrostApiKey = process.env.BLOCKFROST_API_KEY || "preprodotVbkm22Jjy5WZ2Z0Q6GOZZ4zMaUIUeC";

  if (!policyKey) throw new Error("POLICY_KEY not set");

  // Read the unsigned tx
  const txHex = (await fs.readFile("/tmp/datum-fix/mpt-migration.cbor.hex", "utf-8")).trim();
  const tx = decodeTx(Buffer.from(txHex, "hex"));

  // Derive the admin signing key (derivation 0 = root key)
  const [, keyBytes] = decodeBech32(policyKey);
  const rootKey = new Bip32PrivateKey(Buffer.from(keyBytes));
  const privKey = rootKey.toPrivateKey();
  const pubKeyBytes = privKey.toPublicKey().toBytes();

  // Sign
  const txId = tx.id();
  const sigBytes = privKey.sign(Buffer.from(txId.bytes));
  const signature = makeSignature(Array.from(pubKeyBytes), Array.from(sigBytes));
  tx.addSignature(signature);

  console.log(`TxHash: ${txId.toHex()}`);
  console.log(`Signed tx size: ${tx.toCbor().length / 2} bytes`);

  // Submit
  const blockfrost = makeBlockfrostV0Client("preprod", blockfrostApiKey);
  console.log("Submitting...");
  await blockfrost.submitTx(tx);
  console.log("Submitted!");
};

main().catch((e) => {
  console.error("ERROR:", e.message || e);
  process.exit(1);
});
