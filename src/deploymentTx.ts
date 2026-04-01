import { Buffer } from "node:buffer";

import {
  type Address,
  type TxInput,
  makeAddress,
  makeAssetClass,
  makeAssets,
  makeInlineTxOutputDatum,
  makeTxOutput,
  makeValue,
  type Tx,
} from "@helios-lang/ledger";
import { makeTxBuilder } from "@helios-lang/tx-utils";
import { decodeUplcData, decodeUplcProgramV2FromCbor } from "@helios-lang/uplc";

import { PREFIX_222 } from "./constants/index.js";
import type { DesiredContractTarget, DesiredDeploymentState } from "./deploymentState.js";
import { getBlockfrostV0Client } from "./helpers/blockfrost/client.js";
import { deploy } from "./txs/deploy.js";
import { fetchNetworkParameters } from "./utils/index.js";

export interface DeployerWallet {
  address: Address;
  utxos: TxInput[];
}

export const resolveDeployerWallet = async ({
  network,
  currentSubhandle,
  userAgent,
  blockfrostApiKey,
  fetchFn = fetch,
}: {
  network: "preview" | "preprod" | "mainnet";
  currentSubhandle: string;
  userAgent: string;
  blockfrostApiKey: string;
  fetchFn?: typeof fetch;
}): Promise<DeployerWallet> => {
  const baseUrl =
    network === "preview" ? "https://preview.api.handle.me" :
    network === "preprod" ? "https://preprod.api.handle.me" :
    "https://api.handle.me";

  const response = await fetchFn(
    `${baseUrl}/handles/${encodeURIComponent(currentSubhandle)}`,
    { headers: { "User-Agent": userAgent } }
  );
  if (!response.ok) {
    throw new Error(`failed to resolve deployer from ${currentSubhandle}: HTTP ${response.status}`);
  }
  const handle = await response.json() as { resolved_addresses?: { ada?: string } };
  const bech32 = handle.resolved_addresses?.ada;
  if (!bech32) {
    throw new Error(`handle ${currentSubhandle} has no resolved ADA address`);
  }

  const address = makeAddress(bech32);
  if (address.spendingCredential.kind !== "PubKeyHash") {
    throw new Error(`deployer address from ${currentSubhandle} is not a PubKeyHash address`);
  }

  const client = getBlockfrostV0Client(blockfrostApiKey);
  const utxos = await client.getUtxos(address);
  if (utxos.length === 0) {
    throw new Error(`deployer wallet ${bech32} has no UTxOs`);
  }

  return { address, utxos };
};

export const buildReferenceScriptDeploymentTx = async ({
  desired,
  contract,
  handleName,
  changeAddress,
  spareUtxos,
}: {
  desired: DesiredDeploymentState;
  contract: DesiredContractTarget;
  handleName: string;
  changeAddress: Address;
  spareUtxos: TxInput[];
}): Promise<Tx> => {
  const networkParametersResult = await fetchNetworkParameters(desired.network);
  if (!networkParametersResult.ok) {
    throw new Error("Failed to fetch network parameter");
  }

  const txBuilder = makeTxBuilder({ isMainnet: desired.network === "mainnet" });

  const deployData = await deploy({
    network: desired.network,
    mintVersion: BigInt(desired.buildParameters.mintVersion),
    legacyPolicyId: desired.buildParameters.legacyPolicyId,
    adminVerificationKeyHash: desired.buildParameters.adminVerificationKeyHash,
    contractName: contract.build.contractName,
  });

  const handleValue = makeValue(
    1n,
    makeAssets([
      [
        makeAssetClass(
          `${desired.buildParameters.legacyPolicyId}.${PREFIX_222}${Buffer.from(handleName, "utf8").toString("hex")}`
        ),
        1n,
      ],
    ])
  );
  const handleInputIndex = spareUtxos.findIndex((utxo) => utxo.value.isGreaterOrEqual(handleValue));
  if (handleInputIndex < 0) {
    throw new Error(`Deployer wallet does not hold $${handleName}`);
  }

  const handleInput = spareUtxos.splice(handleInputIndex, 1)[0];
  txBuilder.spendUnsafe(handleInput);

  const output = makeTxOutput(
    changeAddress,
    handleValue,
    deployData.datumCbor ? makeInlineTxOutputDatum(decodeUplcData(deployData.datumCbor)) : undefined,
    decodeUplcProgramV2FromCbor(deployData.optimizedCbor)
  );
  output.correctLovelace(networkParametersResult.data);
  txBuilder.addOutput(output);

  return await txBuilder.build({
    changeAddress,
    spareUtxos,
  });
};
