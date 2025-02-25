import { NetworkName } from "@helios-lang/tx-utils";
import { ScriptDetails, ScriptType } from "@koralabs/kora-labs-common";
import { CONTRACT_NAMES } from "constants/index.js";

import { allDeployedScripts } from "../deployed/index.js";

const fetchDeployedScript = async (
  network: NetworkName,
  contractName: string
): Promise<ScriptDetails> => {
  const deployedScripts = allDeployedScripts[network];
  if (!deployedScripts)
    throw new Error(`No Deployed scripts found on ${network} network`);

  if (!(contractName in contractNameToTypeMap))
    throw new Error(
      `Contract name must be one of ${CONTRACT_NAMES.join(", ")}`
    );
  const foundScriptDetails = Object.values(deployedScripts).find(
    (item) => item.type == (contractNameToTypeMap[contractName] as ScriptType)
  );
  if (!foundScriptDetails)
    throw new Error(`${contractName} script details not deployed`);
  return foundScriptDetails;
};

const contractNameToTypeMap: Record<string, string> = {
  "mint_proxy.mint": "demi_mint_proxy",
  "mint_v1.withdraw": "demi_mint_v1",
  "minting_data_proxy.spend": "demi_minting_data_proxy",
  "minting_data_v1.withdraw": "demi_minting_data_v1",
  "orders.spend": "demi_orders",
};

export { fetchDeployedScript };
