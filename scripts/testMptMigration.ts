import { buildMptRootMigrationTx } from "../src/deploymentTx.js";
import { computeMptRootHash, fetchOldValidatorCbor } from "../src/deploymentPlan.js";
import { loadDesiredDeploymentState } from "../src/deploymentState.js";
import fs from "node:fs/promises";

async function main() {
  const desired = await loadDesiredDeploymentState("deploy/preprod/decentralized-minting.yaml");
  const userAgent = "test/1.0";
  const blockfrostApiKey = process.env.BLOCKFROST_API_KEY!;

  console.log("Fetching old validator...");
  const oldValidatorCborHex = await fetchOldValidatorCbor({
    network: "preprod",
    currentSubhandle: "demimntmpt1@handlecontract",
    userAgent,
  });
  console.log("Old validator CBOR length:", oldValidatorCborHex.length);

  console.log("Computing MPT root...");
  const newMptRootHash = await computeMptRootHash({ network: "preprod", userAgent });
  console.log("MPT root:", newMptRootHash);

  console.log("Building migration tx...");
  const tx = await buildMptRootMigrationTx({
    desired,
    newMptRootHash,
    oldValidatorCborHex,
    blockfrostApiKey,
    userAgent,
  });
  console.log("Success! CBOR length:", tx.cborHex.length / 2, "bytes");
  
  await fs.mkdir("/tmp/datum-fix", { recursive: true });
  await fs.writeFile("/tmp/datum-fix/mpt-migration.cbor.hex", tx.cborHex + "\n");
  console.log("Written to /tmp/datum-fix/mpt-migration.cbor.hex");
}
main().catch(e => console.error("ERROR:", e.message));
