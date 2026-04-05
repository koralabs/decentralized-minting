import fs from "node:fs/promises";
import path from "node:path";

import {
  buildUnsignedDeploymentTxArtifact,
  buildUnsignedSettingsUpdateTxArtifact,
  buildDeploymentPlan,
  buildExpectedContractStates,
  computeMptRootHash,
  discoverNextContractSubhandles,
  fetchLiveContractStates,
  fetchLiveSettingsState,
  fetchOldValidatorCbor,
  renderTransactionOrderMarkdown,
} from "../src/deploymentPlan.js";
import { loadDesiredDeploymentState } from "../src/deploymentState.js";
import { buildMptRootMigrationTx, resolveDeployerWallet } from "../src/deploymentTx.js";

const parseArgs = (argv: string[]) => {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`missing value for ${token}`);
    }
    args[token.slice(2)] = next;
    index += 1;
  }
  return args;
};

const renderSummaryMarkdown = (summaryMarkdown: string, transactionOrder: string[]) => {
  const lines = summaryMarkdown.split("\n");
  const transactionOrderIndex = lines.lastIndexOf("## Transaction Order");
  if (transactionOrderIndex < 0) {
    return summaryMarkdown;
  }
  return [
    ...lines.slice(0, transactionOrderIndex + 1),
    ...renderTransactionOrderMarkdown(transactionOrder),
  ].join("\n");
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.desired || !args["artifacts-dir"]) {
    throw new Error("usage: --desired <path> --artifacts-dir <dir>");
  }

  const blockfrostApiKey = (args["blockfrost-api-key"] || process.env.BLOCKFROST_API_KEY || "").trim();
  const nativeScriptCborHex = (process.env.HANDLECONTRACT_NATIVE_SCRIPT_CBOR || "").trim();
  const desired = await loadDesiredDeploymentState(args.desired);
  const userAgent = (process.env.KORA_USER_AGENT || "kora-contract-deployments/1.0").trim();
  const expectedContracts = buildExpectedContractStates(desired);
  const liveContracts = await fetchLiveContractStates({
    network: desired.network,
    contracts: desired.contracts,
    userAgent,
  });
  const plan = buildDeploymentPlan({
    desired,
    expectedContracts,
    liveContracts,
    liveSettings: await fetchLiveSettingsState({
      network: desired.network,
      userAgent,
    }),
    nextSubhandles: await discoverNextContractSubhandles({
      network: desired.network,
      contracts: desired.contracts,
      liveContracts,
      userAgent,
    }),
  });
  const generatedArtifacts = ["summary.json", "summary.md", "deployment-plan.json"];
  let transactionOrder: string[] = [];
  let txArtifactGenerated = false;
  let deployerAddress = "";

  await fs.mkdir(args["artifacts-dir"], { recursive: true });
  const writePlanFiles = async () => {
    for (const [name, payload] of Object.entries({
      "summary.json": JSON.stringify({
        ...plan.summaryJson,
        deployer_address: deployerAddress,
        transaction_order: transactionOrder,
        tx_artifact_generated: txArtifactGenerated,
        artifact_files: generatedArtifacts,
      }, null, 2),
      "summary.md": renderSummaryMarkdown(plan.summaryMarkdown, transactionOrder),
      "deployment-plan.json": JSON.stringify({
        ...plan.deploymentPlanJson,
        deployer_address: deployerAddress,
        transaction_order: transactionOrder,
        tx_artifact_generated: txArtifactGenerated,
        artifact_files: generatedArtifacts,
      }, null, 2),
    })) {
      await fs.writeFile(path.join(args["artifacts-dir"], name), `${payload}\n`);
    }
  };
  await writePlanFiles();

  const changedContracts = plan.summaryJson.contracts.filter(
    (contract) => contract.drift_type === "script_hash_only" || contract.drift_type === "script_hash_and_settings"
  );
  if (!changedContracts.length) {
    return;
  }
  if (!blockfrostApiKey) {
    console.log("Skipping unsigned tx generation: no Blockfrost API key available");
    return;
  }

  // Discover deployer wallet from the first changed contract's current subhandle holder
  const contractWithSubhandle = changedContracts.find(
    (c) => liveContracts.find((lc) => lc.contractSlug === c.contract_slug)?.currentSubhandle
  );
  if (!contractWithSubhandle) {
    console.log("Skipping unsigned tx generation: no existing deployment subhandle found to resolve deployer wallet");
    return;
  }
  const currentSubhandle = liveContracts.find(
    (lc) => lc.contractSlug === contractWithSubhandle.contract_slug
  )!.currentSubhandle!;

  const deployer = await resolveDeployerWallet({
    network: desired.network,
    currentSubhandle,
    userAgent,
    blockfrostApiKey,
  });
  deployerAddress = deployer.address.toString();
  console.log(`Resolved deployer from $${currentSubhandle}: ${deployerAddress} (${deployer.utxos.length} UTxOs)`);
  await writePlanFiles();

  let txIndex = 0;
  for (const contractPlan of changedContracts) {
    const desiredContract = desired.contracts.find((contract) => contract.contractSlug === contractPlan.contract_slug);
    const handleName = String(contractPlan.subhandle.value ?? "").trim();
    if (!desiredContract || !handleName) {
      console.log(`Skipping ${contractPlan.contract_slug}: missing deployment target`);
      continue;
    }
    try {
      const txArtifact = await buildUnsignedDeploymentTxArtifact({
        desired,
        contract: desiredContract,
        handleName,
        deployer,
        nativeScriptCborHex: nativeScriptCborHex || undefined,
        blockfrostApiKey: blockfrostApiKey || undefined,
        userAgent,
      });
      txIndex += 1;
      const fileName = `tx-${String(txIndex).padStart(2, "0")}.cbor`;
      await fs.writeFile(path.join(args["artifacts-dir"], fileName), txArtifact.cborBytes);
      await fs.writeFile(path.join(args["artifacts-dir"], `${fileName}.hex`), `${txArtifact.cborHex}\n`);
      generatedArtifacts.push(fileName, `${fileName}.hex`);
      transactionOrder.push(fileName);
      txArtifactGenerated = true;
    } catch (error) {
      console.log(`Skipping tx for ${contractPlan.contract_slug} ($${handleName}): ${error instanceof Error ? error.message : error}`);
    }
  }
  // Generate settings update tx if settings changed
  const hasSettingsDrift = plan.summaryJson.contracts.some(
    (c) => c.drift_type === "settings_only" || c.drift_type === "script_hash_and_settings"
  );
  if (hasSettingsDrift) {
    const settingsHandleName = "demi@handle_settings";
    try {
      const settingsTxArtifact = await buildUnsignedSettingsUpdateTxArtifact({
        desired,
        settingsHandleName,
        deployer,
        nativeScriptCborHex: nativeScriptCborHex || undefined,
        blockfrostApiKey: blockfrostApiKey || undefined,
        userAgent,
      });
      txIndex += 1;
      const fileName = `tx-${String(txIndex).padStart(2, "0")}.cbor`;
      await fs.writeFile(path.join(args["artifacts-dir"], fileName), settingsTxArtifact.cborBytes);
      await fs.writeFile(path.join(args["artifacts-dir"], `${fileName}.hex`), `${settingsTxArtifact.cborHex}\n`);
      generatedArtifacts.push(fileName, `${fileName}.hex`);
      transactionOrder.push(fileName);
      txArtifactGenerated = true;
      console.log(`Generated settings update tx: ${fileName} for $${settingsHandleName}`);
    } catch (error) {
      console.log(`Skipping settings update tx: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Generate MPT root migration tx if demimntmpt has script hash drift
  const mptContract = plan.summaryJson.contracts.find(
    (c) => c.contract_slug === "demimntmpt" &&
      (c.drift_type === "script_hash_only" || c.drift_type === "script_hash_and_settings")
  );
  if (mptContract && blockfrostApiKey) {
    const currentMptSubhandle = liveContracts.find(
      (lc) => lc.contractSlug === "demimntmpt"
    )?.currentSubhandle;

    if (!currentMptSubhandle) {
      console.log("Skipping MPT root migration: no current demimntmpt subhandle found");
    } else {
      try {
        console.log("Computing MPT root hash from API handle set...");
        const newMptRootHash = await computeMptRootHash({
          network: desired.network,
          userAgent,
        });
        console.log(`Computed MPT root hash: ${newMptRootHash}`);

        console.log(`Fetching old validator script from $${currentMptSubhandle}...`);
        const oldValidatorCborHex = await fetchOldValidatorCbor({
          network: desired.network,
          currentSubhandle: currentMptSubhandle,
          userAgent,
        });

        const migrationTx = await buildMptRootMigrationTx({
          desired,
          newMptRootHash,
          oldValidatorCborHex,
          blockfrostApiKey,
          userAgent,
        });

        txIndex += 1;
        const fileName = `tx-${String(txIndex).padStart(2, "0")}-mpt-migration.cbor`;
        const cborBytes = Buffer.from(migrationTx.cborHex, "hex");
        await fs.writeFile(path.join(args["artifacts-dir"], fileName), cborBytes);
        await fs.writeFile(path.join(args["artifacts-dir"], `${fileName}.hex`), `${migrationTx.cborHex}\n`);
        generatedArtifacts.push(fileName, `${fileName}.hex`);
        transactionOrder.push(fileName);
        txArtifactGenerated = true;
        console.log(`Generated MPT root migration tx: ${fileName} (requires admin/policy key signature)`);
      } catch (error) {
        console.log(`Skipping MPT root migration tx: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  if (txArtifactGenerated) {
    await writePlanFiles();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
