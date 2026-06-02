#!/usr/bin/env node
// Read-only inventory of CIP-67 label assets (001/002/003) under the legacy handle policy,
// across preview/preprod/mainnet, to find duplicates that must be deduped (burned) before
// committing a label-registry-bearing mpt-root. See docs/product/legacy-parity-plan.md (WS1).
//
// Source: Koios (keyless). Duplicate signal = on-chain total_supply > 1 for a given label asset.
// Usage: node scripts/inventory-label-assets.mjs [network ...]   (default: all three)

const LEGACY_POLICY = "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";

const KOIOS = {
  preview: "https://preview.koios.rest/api/v1",
  preprod: "https://preprod.koios.rest/api/v1",
  mainnet: "https://api.koios.rest/api/v1",
};

// label -> CIP-67 asset-name prefix (hex). 003 has no defined prefix yet; included for completeness.
const LABELS = {
  "001": "00001070",
  "002": "000020e0",
};

const PAGE = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hexToUtf8 = (hex) => {
  try {
    const s = Buffer.from(hex, "hex").toString("utf8");
    // flag non-printable so we don't silently mangle odd names
    return /^[\x20-\x7e]*$/.test(s) ? s : `0x${hex} (non-ascii)`;
  } catch {
    return `0x${hex} (undecodable)`;
  }
};

async function fetchLabelAssets(base, prefix) {
  const out = [];
  let offset = 0;
  for (;;) {
    const url =
      `${base}/policy_asset_list?_asset_policy=${LEGACY_POLICY}` +
      `&asset_name=like.${prefix}*&select=asset_name,total_supply` +
      `&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`Koios ${res.status} ${res.statusText} for ${url}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
    await sleep(250); // be polite to the free tier
  }
  return out;
}

async function inventoryNetwork(network) {
  const base = KOIOS[network];
  if (!base) throw new Error(`unknown network ${network}`);
  const report = { network, labels: {} };
  for (const [label, prefix] of Object.entries(LABELS)) {
    const rows = await fetchLabelAssets(base, prefix);
    const dupes = rows
      .filter((r) => Number(r.total_supply) > 1)
      .map((r) => ({
        handle: hexToUtf8(r.asset_name.slice(prefix.length)),
        asset_name: r.asset_name,
        total_supply: Number(r.total_supply),
      }))
      .sort((a, b) => b.total_supply - a.total_supply);
    report.labels[label] = { total: rows.length, duplicates: dupes };
  }
  return report;
}

async function main() {
  const networks = process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["preview", "preprod", "mainnet"];

  const reports = [];
  for (const net of networks) {
    process.stderr.write(`\n# inventorying ${net} ...\n`);
    const r = await inventoryNetwork(net);
    reports.push(r);
    for (const [label, info] of Object.entries(r.labels)) {
      process.stderr.write(
        `  ${net} ${label}: ${info.total} assets, ${info.duplicates.length} duplicated\n`
      );
      for (const d of info.duplicates) {
        process.stderr.write(`    DUP x${d.total_supply}  ${label}  ${d.handle}\n`);
      }
    }
  }
  // machine-readable to stdout
  process.stdout.write(JSON.stringify(reports, null, 2) + "\n");
}

main().catch((e) => {
  console.error("inventory failed:", e.message);
  process.exit(1);
});
