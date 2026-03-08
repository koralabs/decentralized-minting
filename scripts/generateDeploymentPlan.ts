import fs from "node:fs/promises";
import path from "node:path";

import { buildDeploymentPlan, buildExpectedContractStates, fetchLiveContractStates } from "../src/deploymentPlan.js";
import { loadDesiredDeploymentState } from "../src/deploymentState.js";

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

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.desired || !args["artifacts-dir"]) {
    throw new Error("usage: --desired <path> --artifacts-dir <dir>");
  }

  const desired = await loadDesiredDeploymentState(args.desired);
  const userAgent = (process.env.KORA_USER_AGENT || "kora-contract-deployments/1.0").trim();
  const plan = buildDeploymentPlan({
    desired,
    expectedContracts: buildExpectedContractStates(desired),
    liveContracts: await fetchLiveContractStates({
      network: desired.network,
      contracts: desired.contracts,
      userAgent,
    }),
  });

  await fs.mkdir(args["artifacts-dir"], { recursive: true });
  for (const [name, payload] of Object.entries({
    "summary.json": JSON.stringify({
      ...plan.summaryJson,
      tx_artifact_generated: false,
      artifact_files: ["summary.json", "summary.md", "deployment-plan.json"],
    }, null, 2),
    "summary.md": plan.summaryMarkdown,
    "deployment-plan.json": JSON.stringify({
      ...plan.deploymentPlanJson,
      tx_artifact_generated: false,
      artifact_files: ["summary.json", "summary.md", "deployment-plan.json"],
    }, null, 2),
  })) {
    await fs.writeFile(path.join(args["artifacts-dir"], name), `${payload}\n`);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
