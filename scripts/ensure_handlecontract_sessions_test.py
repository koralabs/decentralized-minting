#!/usr/bin/env python3
"""ensure_handlecontract_sessions.py requests contract SubHandle sessions from the minting engine over HTTP.

A real local HTTP server stands in for the engine (network boundary); the script under test runs unmodified.
"""
import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))
import ensure_handlecontract_sessions as ehs  # noqa: E402

SECRET = "deploy-plan-secret"


class FakeEngine(BaseHTTPRequestHandler):
    requests: list = []
    minted: set = set()

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        FakeEngine.requests.append({"path": self.path, "auth": self.headers.get("Authorization"), "body": body})
        if self.headers.get("Authorization") != f"Bearer {SECRET}":
            return self._reply(401, {"error": True, "message": "Unauthorized."})
        handle = body["handle"]
        status = "existing_on_chain" if handle in FakeEngine.minted else "session_created"
        self._reply(200, {"error": False, "status": status, "handle": handle, "txHash": None if status == "existing_on_chain" else "ab" * 32})

    def _reply(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


class EnsureHandlecontractSessionsTest(unittest.TestCase):
    def setUp(self):
        FakeEngine.requests = []
        FakeEngine.minted = {"persdsg2@handlecontract"}
        self.server = HTTPServer(("127.0.0.1", 0), FakeEngine)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.tmp = tempfile.TemporaryDirectory()
        self.network_dir = Path(self.tmp.name) / "preview"
        self.network_dir.mkdir()
        summary = {
            "contracts": [
                {"subhandle": {"action": "allocate", "value": "PersPrx3@handlecontract"}},
                {"subhandle": {"action": "allocate", "value": "persdsg2@handlecontract"}},
                {"subhandle": {"action": "reuse", "value": "perspz1@handlecontract"}},
            ],
            "artifact_files": ["tx-01.cbor"],
            "transaction_order": ["tx-01.cbor"],
        }
        (self.network_dir / "summary.json").write_text(json.dumps(summary))
        (self.network_dir / "deployment-plan.json").write_text(json.dumps({"transaction_order": ["tx-01.cbor"]}))
        (self.network_dir / "summary.md").write_text("# plan\n")
        (self.network_dir / "tx-01.cbor").write_text("00")

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def run_main(self, secret=SECRET):
        env = {"MINTING_ENGINE_URL": f"http://127.0.0.1:{self.server.server_port}", "KORA_BOT_MINT_SECRET": secret}
        with mock.patch.dict(os.environ, env), mock.patch.object(ehs, "PAYMENT_SPACING_SECONDS", 0), \
                mock.patch.object(sys, "argv", ["ehs", "--artifacts-dir", self.tmp.name]):
            ehs.main()

    # Invariant: only `allocate` SubHandles are requested, as { handle } with the bearer secret — no POLICY_KEY,
    # no txHash, no session-table access — and a pending mint blocks the plan's tx artifacts.
    # Failure caught: CI paying/writing sessions itself again, requesting reuse handles, or emitting txs early.
    def test_requests_allocations_from_engine_and_blocks_plan_until_minted(self):
        self.run_main()

        self.assertEqual(
            [(r["path"], r["auth"], r["body"]) for r in FakeEngine.requests],
            [
                ("/handlecontract-session", f"Bearer {SECRET}", {"handle": "persdsg2@handlecontract"}),
                ("/handlecontract-session", f"Bearer {SECRET}", {"handle": "persprx3@handlecontract"}),
            ],
        )
        plan = json.loads((self.network_dir / "deployment-plan.json").read_text())
        self.assertEqual(plan["waiting_for_handlecontract_mints"], ["persprx3@handlecontract"])
        self.assertEqual(plan["transaction_order"], [])
        self.assertFalse((self.network_dir / "tx-01.cbor").exists())
        sessions = json.loads((self.network_dir / "handlecontract-sessions.json").read_text())
        self.assertEqual([i["status"] for i in sessions["items"]], ["existing_on_chain", "session_created"])

    # Edge: every allocation already minted -> nothing waits and the plan's tx order is kept.
    def test_already_minted_allocations_do_not_block_the_plan(self):
        FakeEngine.minted.add("persprx3@handlecontract")
        self.run_main()
        plan = json.loads((self.network_dir / "deployment-plan.json").read_text())
        self.assertEqual(plan["waiting_for_handlecontract_mints"], [])
        self.assertEqual(plan["transaction_order"], ["tx-01.cbor"])

    # Failure: a rejected request must fail the step loudly (not record a fake session).
    def test_engine_rejection_fails_the_step(self):
        with self.assertRaisesRegex(RuntimeError, r"HTTP 401 .*Unauthorized"):
            self.run_main(secret="wrong")
        self.assertFalse((self.network_dir / "handlecontract-sessions.json").exists())

    def test_missing_secret_fails_before_any_request(self):
        with self.assertRaisesRegex(RuntimeError, "KORA_BOT_MINT_SECRET is required"):
            self.run_main(secret="")
        self.assertEqual(FakeEngine.requests, [])


if __name__ == "__main__":
    unittest.main()
