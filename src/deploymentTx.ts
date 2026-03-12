import { Buffer } from "node:buffer";

import {
  decodeTxInput,
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
import { deploy } from "./txs/deploy.js";
import { fetchNetworkParameters } from "./utils/index.js";

export const buildReferenceScriptDeploymentTx = async ({
  desired,
  contract,
  handleName,
  changeAddress,
  cborUtxos,
}: {
  desired: DesiredDeploymentState;
  contract: DesiredContractTarget;
  handleName: string;
  changeAddress: string;
  cborUtxos: string[];
}): Promise<Tx> => {
  const networkParametersResult = await fetchNetworkParameters(desired.network);
  if (!networkParametersResult.ok) {
    throw new Error("Failed to fetch network parameter");
  }

  const txBuilder = makeTxBuilder({ isMainnet: desired.network === "mainnet" });
  const address = makeAddress(changeAddress);
  if (address.spendingCredential.kind !== "PubKeyHash") {
    throw new Error("Must be Base wallet to deploy");
  }

  const spareUtxos = cborUtxos.map(decodeTxInput);
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
    throw new Error(`You don't have $${handleName} handle`);
  }

  const handleInput = spareUtxos.splice(handleInputIndex, 1)[0];
  txBuilder.spendUnsafe(handleInput);

  const output = makeTxOutput(
    address,
    handleValue,
    deployData.datumCbor ? makeInlineTxOutputDatum(decodeUplcData(deployData.datumCbor)) : undefined,
    decodeUplcProgramV2FromCbor(deployData.optimizedCbor)
  );
  output.correctLovelace(networkParametersResult.data);
  txBuilder.addOutput(output);

  return await txBuilder.build({
    changeAddress: address,
    spareUtxos,
  });
};
