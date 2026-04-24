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

  // Generate MPT root migration tx if handle_root@handle_settings is at the wrong address.
  // This can happen after a demimntmpt upgrade — the ref script is deployed but the
  // handle_root UTxO still sits at the old validator address.
  const mptContract = plan.summaryJson.contracts.find(
    (c) => c.contract_slug === "demimntmpt"
  );
  const mptNeedsMigration = await (async () => {
    if (!mptContract || !blockfrostApiKey) return false;
    // If there's a script hash change, migration is always needed
    if (mptContract.drift_type === "script_hash_only" || mptContract.drift_type === "script_hash_and_settings") return true;
    // Check if handle_root@handle_settings is at the expected validator address
    try {
      const { fetch: crossFetch } = await import("cross-fetch");
      const baseUrl = desired.network === "preview" ? "https://preview.api.handle.me" :
        desired.network === "preprod" ? "https://preprod.api.handle.me" : "https://api.handle.me";
      const rootRes = await crossFetch(`${baseUrl}/handles/${encodeURIComponent("handle_root@handle_settings")}`,
        { headers: { "User-Agent": userAgent } });
      if (!rootRes.ok) return false;
      const rootHandle = await rootRes.json() as { resolved_addresses?: { ada?: string } };
      const currentAddress = rootHandle.resolved_addresses?.ada ?? "";
      // Get the expected address from the latest demimntmpt subhandle
      const latestSub = mptContract.subhandle?.value ?? "";
      if (!latestSub) return false;
      const subRes = await crossFetch(`${baseUrl}/handles/${encodeURIComponent(latestSub)}`,
        { headers: { "User-Agent": userAgent } });
      if (!subRes.ok) return false;
      const subHandle = await subRes.json() as { resolved_addresses?: { ada?: string } };
      const expectedScriptAddress = subHandle.resolved_addresses?.ada ?? "";
      // The handle_root should be at the validator address derived from the latest script hash,
      // NOT at the subhandle's address. Compute expected from the built contracts.
      const { buildContracts } = await import("../src/contracts/config.js");
      const built = buildContracts({
        network: desired.network,
        mint_version: BigInt(desired.buildParameters.mintVersion),
        legacy_policy_id: desired.buildParameters.legacyPolicyId,
        admin_verification_key_hash: desired.buildParameters.adminVerificationKeyHash,
      });
      const expectedAddress = built.mintingData.scriptAddress;
      const needsMigration = currentAddress !== expectedAddress;
      if (needsMigration) {
        console.log(`handle_root@handle_settings is at ${currentAddress.slice(0, 30)}... but should be at ${expectedAddress.slice(0, 30)}...`);
      }
      return needsMigration;
    } catch (err) {
      console.log(`MPT-migration address check failed: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  })();
  if (mptNeedsMigration) {
    const currentMptSubhandle = liveContracts.find(
      (lc) => lc.contractSlug === "demimntmpt"
    )?.currentSubhandle;

    if (!currentMptSubhandle) {
      console.log("Skipping MPT root migration: no current demimntmpt subhandle found");
    } else {
      try {
        // Check if admin wallet needs funding and generate a prep tx
        const prepTx = await buildPreparationTx({
          desired,
          nativeScriptCborHex: nativeScriptCborHex || undefined,
          blockfrostApiKey,
          userAgent,
          excludeUtxoRefs: consumedUtxoRefs,
        });
        if (prepTx) {
          for (const ref of prepTx.consumedInputs) consumedUtxoRefs.add(ref);
          txIndex += 1;
          const prepFileName = `tx-${String(txIndex).padStart(2, "0")}-admin-funding.cbor`;
          const prepCborBytes = Buffer.from(prepTx.cborHex, "hex");
          await fs.writeFile(path.join(args["artifacts-dir"], prepFileName), prepCborBytes);
          await fs.writeFile(path.join(args["artifacts-dir"], `${prepFileName}.hex`), `${prepTx.cborHex}\n`);
          generatedArtifacts.push(prepFileName, `${prepFileName}.hex`);
          transactionOrder.push(prepFileName);
          txArtifactGenerated = true;
          console.log(`Generated admin funding tx: ${prepFileName} (sign and submit before MPT migration)`);
        }

        console.log("Computing MPT root hash from API handle set...");
        const newMptRootHash = await computeMptRootHash({
          network: desired.network,
          userAgent,
        });
        console.log(`Computed MPT root hash: ${newMptRootHash}`);

        // Fetch the OLD minting-data validator script by hash, not by subhandle.
        // After phase-1 deployment, `currentSubhandle` points at the NEW ordinal
        // (e.g. demimntmpt2) whose /script endpoint returns the NEW CBOR —
        // wrong for the migration, which must spend handle_root at its OLD
        // address using the OLD script. Extract the script hash from
        // handle_root's current resolved address (first 28 bytes after the
        // 1-byte bech32 header) and fetch via Blockfrost /scripts/{hash}/cbor.
        const { fetch: crossFetch2 } = await import("cross-fetch");
        const handlesBase = desired.network === "preview" ? "https://preview.api.handle.me" :
          desired.network === "preprod" ? "https://preprod.api.handle.me" : "https://api.handle.me";
        const rootRes2 = await crossFetch2(
          `${handlesBase}/handles/${encodeURIComponent("handle_root@handle_settings")}`,
          { headers: { "User-Agent": userAgent } }
        );
        if (!rootRes2.ok) throw new Error(`failed to fetch handle_root: HTTP ${rootRes2.status}`);
        const rootJson2 = await rootRes2.json() as { resolved_addresses?: { ada?: string } };
        const oldAddrBech32 = rootJson2.resolved_addresses?.ada;
        if (!oldAddrBech32) throw new Error("handle_root missing resolved ADA address");
        const { Cardano: CardanoSdk } = await import("@cardano-sdk/core");
        const oldPaymentCred = CardanoSdk.Address.fromBech32(oldAddrBech32).asEnterprise()?.getPaymentCredential();
        if (!oldPaymentCred) throw new Error(`handle_root address ${oldAddrBech32} is not a script enterprise address`);
        const oldScriptHash = oldPaymentCred.hash as unknown as string;
        console.log(`Fetching old validator script by hash ${oldScriptHash}...`);
        const bfHost = `https://cardano-${desired.network}.blockfrost.io/api/v0`;
        const scriptRes = await crossFetch2(`${bfHost}/scripts/${oldScriptHash}/cbor`, {
          headers: { "Content-Type": "application/json", project_id: blockfrostApiKey },
        });
        if (!scriptRes.ok) throw new Error(`failed to fetch script ${oldScriptHash}: HTTP ${scriptRes.status}`);
        const scriptJson = await scriptRes.json() as { cbor?: string };
        if (!scriptJson.cbor) throw new Error(`no cbor in script response for ${oldScriptHash}`);
        const oldValidatorCborHex = scriptJson.cbor;

        try {
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
        } catch (migrationError) {
          if (prepTx) {
            console.log(`MPT root migration tx deferred: admin funding tx must be submitted first, then re-run this workflow`);
          } else {
            throw migrationError;
          }
        }
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
