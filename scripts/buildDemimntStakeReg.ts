// UNSIGNED stake registration for a network's demimnt (mint governor) reward account. The governor is
// a withdraw-0 script, so its reward account must be registered before any DeMi-policy mint/burn.
// Legacy StakeRegistration cert (no publish handler): no script execution, so it can go on chain
// ahead of the ref-script deploy. The governor hash comes from the desired-state YAML's
// settings.values."demi@handle_settings".mint_governor. Nothing here signs or submits.
//
//   BLOCKFROST_API_KEY=... FUNDING_ADDRESS=<key address that signs> \
//     tsx scripts/buildDemimntStakeReg.ts --desired deploy/<network>/decentralized-minting.yaml --out <file>
import { writeFileSync } from "node:fs";

import { loadDesiredDeploymentState } from "../src/deploymentState.js";
import { Cardano } from "../src/helpers/cardano-sdk/index.js";
import { fetchBlockfrostUtxos } from "../src/helpers/cardano-sdk/blockfrostUtxo.js";
import { registerStakingAddress } from "../src/txs/staking.js";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`--${name} is required`);
  return process.argv[i + 1];
};

const main = async () => {
  const desired = await loadDesiredDeploymentState(arg("desired"));
  const network = desired.network;
  const governor = desired.settings.values["demi@handle_settings"].mint_governor;
  const key = process.env.BLOCKFROST_API_KEY;
  const funding = process.env.FUNDING_ADDRESS;
  if (!key || !funding) throw new Error("BLOCKFROST_API_KEY and FUNDING_ADDRESS are required");

  const reward = Cardano.RewardAddress.fromCredentials(
    network === "mainnet" ? Cardano.NetworkId.Mainnet : Cardano.NetworkId.Testnet,
    { type: Cardano.CredentialType.ScriptHash, hash: governor as never },
  ).toAddress().toBech32();
  const account = await fetch(`https://cardano-${network}.blockfrost.io/api/v0/accounts/${reward}`, { headers: { project_id: key } });
  if (account.ok && ((await account.json()) as { active?: boolean }).active) {
    console.log(`${network} demimnt ${governor} reward account ${reward} is already registered; nothing to build`);
    return;
  }

  const utxos = await fetchBlockfrostUtxos(funding, key, network);
  const pure = utxos.filter((u) => !u[1].value.assets?.size);
  const cbor = await registerStakingAddress({
    network, changeAddress: funding, spareUtxos: pure, bech32StakingAddress: reward, blockfrostApiKey: key,
  });
  writeFileSync(arg("out"), `${cbor}\n`);
  console.log(`${network} demimnt ${governor}: UNSIGNED registration of ${reward} written to ${arg("out")}`);
};

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
