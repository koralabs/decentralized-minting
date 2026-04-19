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
import { buildMptRootMigrationTx, buildPreparationTx, resolveDeployerWallet } from "../src/deploymentTx.js";

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
  if (!blockfrostApiKey) {
    console.log("Skipping unsigned tx generation: no Blockfrost API key available");
    return;
  }

  // Discover deployer wallet from the first changed contract's current subhandle holder
  // (or any contract with a subhandle if no contracts have script hash drift)
  const contractWithSubhandle = changedContracts.length > 0
    ? changedContracts.find(
        (c) => liveContracts.find((lc) => lc.contractSlug === c.contract_slug)?.currentSubhandle
      )
    : plan.summaryJson.contracts.find(
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

  // Track consumed UTxOs across all txs to prevent input conflicts
  const consumedUtxoRefs = new Set<string>();

  // Determine whether the MPT-root migration tx will need to be emitted.
  // We compute this UP FRONT so the admin-funding tx (if needed) can be
  // emitted as tx-00 — the operator signs+submits it first, the
  // migration tx then references its predicted outputs as inputs, and
  // the whole chain ships in one workflow run instead of the historical
  // two-phase pattern.
  const mptContract = plan.summaryJson.contracts.find(
    (c) => c.contract_slug === "demimntmpt"
  );
  const mptNeedsMigration = await (async () => {
    if (!mptContract || !blockfrostApiKey) return false;
    if (mptContract.drift_type === "script_hash_only" || mptContract.drift_type === "script_hash_and_settings") return true;
    try {
      const { fetch: crossFetch } = await import("cross-fetch");
      const baseUrl = desired.network === "preview" ? "https://preview.api.handle.me" :
        desired.network === "preprod" ? "https://preprod.api.handle.me" : "https://api.handle.me";
      const rootRes = await crossFetch(`${baseUrl}/handles/${encodeURIComponent("handle_root@handle_settings")}`,
        { headers: { "User-Agent": userAgent } });
      if (!rootRes.ok) return false;
      const rootHandle = await rootRes.json() as { resolved_addresses?: { ada?: string } };
      const currentAddress = rootHandle.resolved_addresses?.ada ?? "";
      const latestSub = mptContract.subhandle?.value ?? "";
      if (!latestSub) return false;
      const subRes = await crossFetch(`${baseUrl}/handles/${encodeURIComponent(latestSub)}`,
        { headers: { "User-Agent": userAgent } });
      if (!subRes.ok) return false;
      const subHandle = await subRes.json() as { resolved_addresses?: { ada?: string } };
      void subHandle;
      const { buildContracts } = await import("../src/contracts/config.js");
      const built = buildContracts({
        network: desired.network,
        mint_version: BigInt(desired.buildParameters.mintVersion),
        legacy_policy_id: desired.buildParameters.legacyPolicyId,
        admin_verification_key_hash: desired.buildParameters.adminVerificationKeyHash,
      });
      const expectedAddress = built.mintingData.mintingDataValidatorAddress.toBech32();
      const needsMigration = currentAddress !== expectedAddress;
      if (needsMigration) {
        console.log(`handle_root@handle_settings is at ${currentAddress.slice(0, 30)}... but should be at ${expectedAddress.slice(0, 30)}...`);
      }
      return needsMigration;
    } catch {
      return false;
    }
  })();

  // If migration is needed, build the admin-funding tx FIRST (as
  // tx-00) and capture the predicted outputs that the migration tx
  // will consume. `buildPreparationTx` returns null when admin
  // already has both a collateral-sized and a fee-sized clean ADA
  // UTxO on chain — in that case no funding tx is emitted.
  let txIndex = 0;
  let pendingAdminFunding: Awaited<ReturnType<typeof buildPreparationTx>> = null;
  if (mptNeedsMigration && blockfrostApiKey) {
    try {
      pendingAdminFunding = await buildPreparationTx({
        desired,
        nativeScriptCborHex: nativeScriptCborHex || undefined,
        blockfrostApiKey,
        userAgent,
        excludeUtxoRefs: consumedUtxoRefs,
      });
      if (pendingAdminFunding) {
        for (const ref of pendingAdminFunding.consumedInputs) consumedUtxoRefs.add(ref);
        // tx-00 is reserved for the funding tx — every subsequent
        // deploy/settings/migration tx in this run is numbered
        // starting at tx-01. Naming pattern matches the historical
        // tx-04-admin-funding emission so K.O.R.A. and operator
        // muscle memory recognize it.
        const prepFileName = `tx-${String(txIndex).padStart(2, "0")}-admin-funding.cbor`;
        const prepCborBytes = Buffer.from(pendingAdminFunding.cborHex, "hex");
        await fs.writeFile(path.join(args["artifacts-dir"], prepFileName), prepCborBytes);
        await fs.writeFile(path.join(args["artifacts-dir"], `${prepFileName}.hex`), `${pendingAdminFunding.cborHex}\n`);
        generatedArtifacts.push(prepFileName, `${prepFileName}.hex`);
        transactionOrder.push(prepFileName);
        txArtifactGenerated = true;
        console.log(`Generated admin funding tx: ${prepFileName} (sign + submit FIRST; migration tx references its predicted outputs)`);
        // Leave txIndex at 0 — the loop below increments BEFORE
        // formatting the filename, so the first deploy tx will be
        // tx-01 even though we just wrote tx-00.
      }
    } catch (error) {
      console.log(`Skipping admin funding tx: ${error instanceof Error ? error.message : error}`);
    }
  }

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
        excludeUtxoRefs: consumedUtxoRefs,
      });
      for (const ref of txArtifact.consumedInputs) consumedUtxoRefs.add(ref);
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
        excludeUtxoRefs: consumedUtxoRefs,
      });
      for (const ref of settingsTxArtifact.consumedInputs) consumedUtxoRefs.add(ref);
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

  // Emit the MPT-root migration tx (last in the manifest). When
  // `pendingAdminFunding` is set, the migration tx references the
  // funding tx's predicted outputs as inputs — operator signs both,
  // submits in order (tx-00 → migration), node accepts the chain.
  if (mptNeedsMigration) {
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
          pendingAdminFunding: pendingAdminFunding?.pendingAdminFundingUtxos,
        });

        txIndex += 1;
        const fileName = `tx-${String(txIndex).padStart(2, "0")}-mpt-migration.cbor`;
        const cborBytes = Buffer.from(migrationTx.cborHex, "hex");
        await fs.writeFile(path.join(args["artifacts-dir"], fileName), cborBytes);
        await fs.writeFile(path.join(args["artifacts-dir"], `${fileName}.hex`), `${migrationTx.cborHex}\n`);
        generatedArtifacts.push(fileName, `${fileName}.hex`);
        transactionOrder.push(fileName);
        txArtifactGenerated = true;
        const chainNote = pendingAdminFunding
          ? " (chained — references admin-funding tx-00 outputs; submit tx-00 first)"
          : " (admin already funded; no chained inputs)";
        console.log(`Generated MPT root migration tx: ${fileName} (requires admin/policy key signature)${chainNote}`);
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
