import { ScriptDetails, ScriptType } from "@koralabs/kora-labs-common";

import { fetchApi } from "../helpers/api.js";

const fetchDeployedScript = async (
  contractType: ScriptType
): Promise<ScriptDetails> => {
  const script = await fetchApi(
    `scripts?latest=true&type=${contractType}`
  ).then((res) => res.json());
  if (!script) throw new Error(`${contractType} script details not deployed`);
  return script;
};

// TODO:
// Add fetchRootHandleSettings function
// This function will fetch the root handle settings

export { fetchDeployedScript };
