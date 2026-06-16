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
  } as unknown as ScriptDetails;
};

// Resolve a deployed script by an EXACT validator hash rather than api
// ordinal-"latest". This is the correct resolution for settings-canonical
// singleton contracts (the minting-data validator and its governor): the live
// instance is the one the on-chain settings pin, which is NOT necessarily the
// highest-ordinal deployment slot. api `latest` is a routing signal ("where do
// new deployments land?"), not a resolution signal ("which impl governs this
// object?"); after a version migration that lands the new script on a lower
// ordinal, those diverge. Resolving by hash binds to the settings, the
// authority. Fails loud if the pinned hash isn't deployed (no silent
// fallback — a missing pinned script is a real deploy gap, not a latest miss).
const fetchDeployedScriptByHash = async (
  contractType: ScriptType,
  expectedHash: string,
): Promise<ScriptDetails> => {
  const slug = LEGACY_TYPE_TO_SLUG[contractType] ?? contractType;
  const want = expectedHash.toLowerCase();
  const response: unknown = await fetchApi(`scripts?type=${slug}`).then((res) =>
    res.json(),
  );
  if (!response || typeof response !== "object") {
    throw new Error(`${contractType} script details not deployed`);
  }

  // Flat shape: { scriptAddress, validatorHash, ... } — a single entry.
  const flat = response as { scriptAddress?: unknown; validatorHash?: string };
  if (typeof flat.scriptAddress === "string") {
    if ((flat.validatorHash ?? "").toLowerCase() === want) {
      return response as ScriptDetails;
    }
    throw new Error(
      `${contractType} deployed script ${flat.validatorHash} does not match settings-pinned hash ${expectedHash}`,
    );
  }

  // Address-keyed shape: pick the entry whose type AND validatorHash match the
  // settings-pinned hash. Note the api type filter is a prefix match
  // (?type=demimnt also returns demimntmpt/demimntprx), so the exact `type`
  // check below is load-bearing, not redundant.
  const entries = Object.entries(
    response as Record<string, { type?: string; validatorHash?: string }>,
  );
  const match = entries.find(
    ([, value]) =>
      value &&
      value.type === slug &&
      (value.validatorHash ?? "").toLowerCase() === want,
  );
  if (!match) {
    throw new Error(
      `${contractType} script with settings-pinned validatorHash ${expectedHash} not found among deployed ${slug} scripts`,
    );
  }
  const [scriptAddress, details] = match;
  return {
    ...(details as Record<string, unknown>),
    scriptAddress,
  } as unknown as ScriptDetails;
};

// TODO:
// Add fetchRootHandleSettings function
// This function will fetch the root handle settings

export { fetchDeployedScript, fetchDeployedScriptByHash };
