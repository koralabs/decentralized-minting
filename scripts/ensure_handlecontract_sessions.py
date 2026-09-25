#!/usr/bin/env python3
import argparse
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path


SECTION_START = "<!-- HANDLECONTRACT_SESSIONS_START -->"
SECTION_END = "<!-- HANDLECONTRACT_SESSIONS_END -->"
PAYMENT_SPACING_SECONDS = 60
# The minting engine owns the handlecontract session: it pays the 2 ADA root-owner fee with its own
# POLICY_KEY and writes the session row in its box-local store. CI only states intent over HTTP.
ENGINE_BASE_URLS = {
    "preview": "https://preview.minting.handle.me",
    "preprod": "https://preprod.minting.handle.me",
    "mainnet": "https://minting.handle.me",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifacts-dir", required=True)
    return parser.parse_args()


def load_json(path: Path) -> dict:
    return json.loads(path.read_text())


def write_json(path: Path, payload: dict) -> None:
    path.write_text(f"{json.dumps(payload, indent=2)}\n")


def update_markdown(path: Path, results: list[dict], waiting_handles: list[str]) -> None:
    content = path.read_text() if path.exists() else ""
    if SECTION_START in content and SECTION_END in content:
        before, remainder = content.split(SECTION_START, 1)
        _, after = remainder.split(SECTION_END, 1)
        content = before.rstrip()
        trailing = after.lstrip()
    else:
        content = content.rstrip()
        trailing = ""

    if not results:
        next_content = content
    else:
        lines = [
            SECTION_START,
            "## Handlecontract Sessions",
            *[
                f"- `{item['handle']}`: `{item['status']}`"
                + (f" (`{item['txHash']}`)" if item.get("txHash") else "")
                for item in results
            ],
        ]
        if waiting_handles:
            lines.append("- Unsigned deployment tx is deferred until the handle mint is on-chain.")
        lines.append(SECTION_END)
        next_content = f"{content}\n\n" + "\n".join(lines) if content else "\n".join(lines)

    final_content = next_content.rstrip()
    if trailing:
        final_content = f"{final_content}\n\n{trailing.rstrip()}"
    path.write_text(f"{final_content}\n")


def handle_targets(summary: dict) -> list[str]:
    handles: list[str] = []
    for contract in summary.get("contracts", []):
        subhandle = contract.get("subhandle") or {}
        value = str(subhandle.get("value") or "").strip().lower()
        if subhandle.get("action") != "allocate":
            continue
        if not value.endswith("@handlecontract"):
            continue
        handles.append(value)
    return sorted(set(handles))


def ensure_session(network: str, handle: str) -> dict:
    """POST { handle } to the engine's /handlecontract-session (Bearer KORA_BOT_MINT_SECRET).

    Idempotent engine-side: existing session / already-minted handle returns without paying.
    """
    secret = os.environ.get("KORA_BOT_MINT_SECRET", "").strip()
    if not secret:
        raise RuntimeError("KORA_BOT_MINT_SECRET is required to request handlecontract sessions")
    base_url = os.environ.get("MINTING_ENGINE_URL") or ENGINE_BASE_URLS[network]
    request = urllib.request.Request(
        f"{base_url}/handlecontract-session",
        data=json.dumps({"handle": handle}).encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
            # Cloudflare rejects urllib's default UA.
            "User-Agent": "kora-deployment-plan/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        body = error.read().decode(errors="replace")[:500]
        raise RuntimeError(f"handlecontract-session for {handle} on {network} failed: HTTP {error.code} {body}") from None


def update_plan_files(network_dir: Path, summary: dict, deployment_plan: dict, results: list[dict]) -> None:
    waiting_handles = sorted(item["handle"] for item in results if item["status"] != "existing_on_chain")
    artifact_files = [name for name in summary.get("artifact_files", []) if not name.startswith("tx-")]
    tx_paths = sorted(network_dir.glob("tx-*.cbor"))
    for path in tx_paths:
        path.unlink()

    if results and "handlecontract-sessions.json" not in artifact_files:
        artifact_files.append("handlecontract-sessions.json")

    summary["artifact_files"] = artifact_files
    summary["tx_artifact_generated"] = False if waiting_handles else summary.get("tx_artifact_generated", False)
    summary["transaction_order"] = [] if waiting_handles else summary.get("transaction_order", [])
    summary["handlecontract_sessions"] = results
    summary["waiting_for_handlecontract_mints"] = waiting_handles

    deployment_plan["artifact_files"] = artifact_files
    deployment_plan["tx_artifact_generated"] = False if waiting_handles else deployment_plan.get("tx_artifact_generated", False)
    deployment_plan["transaction_order"] = [] if waiting_handles else deployment_plan.get("transaction_order", [])
    deployment_plan["handlecontract_sessions"] = results
    deployment_plan["waiting_for_handlecontract_mints"] = waiting_handles

    write_json(network_dir / "summary.json", summary)
    write_json(network_dir / "deployment-plan.json", deployment_plan)
    if results:
        write_json(network_dir / "handlecontract-sessions.json", {"network": network_dir.name, "items": results})
    update_markdown(network_dir / "summary.md", results, waiting_handles)


def main() -> None:
    args = parse_args()
    artifacts_dir = Path(args.artifacts_dir)

    for summary_path in sorted(artifacts_dir.glob("*/summary.json")):
        summary = load_json(summary_path)
        handles = handle_targets(summary)
        if not handles:
            continue

        network_dir = summary_path.parent
        network = network_dir.name
        deployment_plan_path = network_dir / "deployment-plan.json"
        deployment_plan = load_json(deployment_plan_path)
        results = []
        for handle in handles:
            if results and results[-1].get("status") == "session_created":
                # The engine pays from one fee wallet; let Blockfrost index the previous payment's
                # change before the next request so it doesn't reselect the spent UTxO.
                print("Waiting 60s for fee wallet UTxO indexing before next session...", flush=True)
                time.sleep(PAYMENT_SPACING_SECONDS)
            print(f"Ensuring session for {handle}...", flush=True)
            result = ensure_session(network, handle)
            status = result.get("status", "unknown")
            print(f"  {handle}: {status}" + (" (no mint needed)" if status != "session_created" else " (NEW MINT)"), flush=True)
            results.append(result)
        update_plan_files(network_dir, summary, deployment_plan, results)
        print(json.dumps({"network": network, "items": results}))


if __name__ == "__main__":
    main()
