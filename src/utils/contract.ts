import { ScriptDetails, ScriptType } from "@koralabs/kora-labs-common";

import { fetchApi } from "../helpers/api.js";

// Map this lib's legacy ScriptType enum values (snake_case) to the slug names
// used by api.handle.me/scripts (post slug-allowlist refactor — see
// api.handle.me/docs/spec/handlecontract-script-discovery.md). Without this map
// a `?type=demi_mint_proxy` request matches nothing because the new api filters
// on slugs like `demimntprx`. Previously carried as a patch-package patch in
// the minting engine; folded into the source so consumers need no patch.
const LEGACY_TYPE_TO_SLUG: Record<string, string> = {
  pers: "pers",
  persprx: "persprx",
  perspz: "perspz",
  perslfc: "perslfc",
  persdsg: "persdsg",
  pz_contract: "pers",
  sub_handle_settings: "subh",
  marketplace_contract: "mkpl",
  demi_mint_proxy: "demimntprx",
  demi_mint: "demimnt",
  demi_minting_data: "demimntmpt",
  demi_orders: "demiord",
  hal_mint_proxy: "halmntprx",
  hal_mint: "halmnt",
  hal_minting_data: "halmntmpt",
  hal_orders_spend: "halord",
  hal_ref_spend_proxy: "halrefprx",
  hal_ref_spend: "halref",
  hal_royalty_spend: "halroy",
};

const fetchDeployedScript = async (
  contractType: ScriptType
): Promise<ScriptDetails> => {
  const slug = LEGACY_TYPE_TO_SLUG[contractType] ?? contractType;
  const response: unknown = await fetchApi(
    `scripts?latest=true&type=${slug}`
  ).then((res) => res.json());
  if (!response) throw new Error(`${contractType} script details not deployed`);

  // Flat shape: { scriptAddress, validatorHash, ... }
  if (
    typeof (response as { scriptAddress?: unknown }).scriptAddress === "string"
  ) {
    return response as ScriptDetails;
  }
  if (typeof response !== "object") {
    throw new Error(`${contractType} script details not deployed`);
  }

  // Address-keyed shape: { "<scriptAddr>": { type, latest, validatorHash, ... } }
  const entries = Object.entries(
    response as Record<string, { type?: string; latest?: boolean }>
  );
  let match = entries.find(
    ([, value]) => value && value.type === slug && value.latest !== false
  );
  if (!match) {
    match = entries.find(([, value]) => value && value.type === slug);
  }
  if (!match) {
    throw new Error(`${contractType} script details not deployed`);
  }
  const [scriptAddress, details] = match;
  return {
    ...(details as Record<string, unknown>),
    scriptAddress,
  } as ScriptDetails;
};

// TODO:
// Add fetchRootHandleSettings function
// This function will fetch the root handle settings

export { fetchDeployedScript };
