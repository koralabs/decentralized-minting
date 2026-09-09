// Pre-trigger prep: UNSIGNED stake registration for the new demimnt reward account.
// Legacy StakeRegistration cert (no publish handler) — no script execution, so it can
// pre-build before the ref-script deploys. Nothing here signs or submits.
import { Cardano } from "../src/helpers/cardano-sdk/index.js";
import { fetchBlockfrostUtxos } from "../src/helpers/cardano-sdk/blockfrostUtxo.js";

const HASH = "83d1a3c701d88332edad6df0cc0cffcb7412be02774d38ff33e2302b";
const FUNDING = "addr1v8tq9j8f2nmqd6756e4l3n5sp0jk762al6syz6ku3xy2nec27ft6s";
const key = process.env.BLOCKFROST_API_KEY!;

const main = async () => {
  const reward = Cardano.RewardAddress.fromCredentials(Cardano.NetworkId.Mainnet, {
    type: Cardano.CredentialType.ScriptHash, hash: HASH as any
  }).toAddress().toBech32();
  console.log("demimnt reward account:", reward);
  const acct = await fetch(`https://cardano-mainnet.blockfrost.io/api/v0/accounts/${reward}`, { headers: { project_id: key } });
  const a = await acct.json() as any;
  console.log("registered on-chain today?", acct.status === 200 ? a.active : `(${acct.status} — never seen = not registered)`);
  const utxos = await fetchBlockfrostUtxos(FUNDING, key, "mainnet");
  const pure = utxos.filter((u: any) => !u[1].value.assets || u[1].value.assets.size === 0);
  console.log("funding wallet pure-ADA utxos:", pure.length, "total:", pure.reduce((s: bigint, u: any) => s + u[1].value.coins, 0n));
  const { registerStakingAddress } = await import("../src/txs/staking.js") as any;
  const cbor = await registerStakingAddress({
    network: "mainnet", changeAddress: FUNDING, spareUtxos: pure,
    bech32StakingAddress: reward, blockfrostApiKey: key
  });
  const fs = await import("node:fs");
  fs.writeFileSync("/tmp/register-demimnt-stake-unsigned.cbor.hex", cbor);
  console.log("UNSIGNED tx written: /tmp/register-demimnt-stake-unsigned.cbor.hex", cbor.length / 2, "bytes");
};
main().catch((e) => { console.error("FAILED:", e.message, e.cause ?? ""); process.exit(1); });
