#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
from pathlib import Path


SECTION_START = "<!-- HANDLECONTRACT_SESSIONS_START -->"
SECTION_END = "<!-- HANDLECONTRACT_SESSIONS_END -->"
NETWORK_PREFIX = {
    "preview": "PREVIEW",
    "preprod": "PREPROD",
    "mainnet": "MAINNET",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifacts-dir", required=True)
    parser.add_argument("--minting-repo", required=True)
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


def network_env(network: str) -> dict[str, str]:
    prefix = NETWORK_PREFIX[network]
    required = {
        "POLICY_KEY": os.environ.get("POLICY_KEY", ""),
        "POLICY_ID": os.environ.get(f"{prefix}_POLICY_ID", ""),
        "BLOCKFROST_API_KEY": os.environ.get(f"{prefix}_BLOCKFROST_API_KEY", ""),
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise RuntimeError(f"missing required env for {network}: {', '.join(missing)}")

    env = os.environ.copy()
    env.update(required)
    env["NETWORK"] = network.upper()
    env["NODE_ENV"] = "production" if network == "mainnet" else "development"
    if not env.get("AWS_REGION"):
        env["AWS_REGION"] = env.get("AWS_DEFAULT_REGION", "us-east-1")
    return env


def ensure_session(minting_repo: Path, network: str, handle: str) -> dict:
    cmd = [
        "node",
        "--import",
        "tsx",
        "src/scripts/ensureHandlecontractSession.ts",
        "--handle",
        handle,
    ]
    result = subprocess.run(cmd, text=True, capture_output=True, cwd=minting_repo, env=network_env(network))
    if result.returncode != 0:
        print(f"ensure_session failed for {handle} on {network} (exit {result.returncode}):", flush=True)
        if result.stdout.strip():
            print(f"  stdout: {result.stdout.strip()}", flush=True)
        if result.stderr.strip():
            print(f"  stderr: {result.stderr.strip()}", flush=True)
        result.check_returncode()
    # The minting engine writes the JSON result as the last stdout line.
    # Logger output may appear before it.
    stdout_lines = [line for line in result.stdout.strip().splitlines() if line.strip()]
    for line in reversed(stdout_lines):
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            continue
    raise RuntimeError(f"ensure_session for {handle} produced no JSON output: {result.stdout[:500]}")


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
    minting_repo = Path(args.minting_repo)

    for summary_path in sorted(artifacts_dir.glob("*/summary.json")):
        summary = load_json(summary_path)
        handles = handle_targets(summary)
        if not handles:
            continue

        network_dir = summary_path.parent
        network = network_dir.name
        deployment_plan_path = network_dir / "deployment-plan.json"
        deployment_plan = load_json(deployment_plan_path)
        results = [ensure_session(minting_repo, network, handle) for handle in handles]
        update_plan_files(network_dir, summary, deployment_plan, results)
        print(json.dumps({"network": network, "items": results}))


if __name__ == "__main__":
    main()
