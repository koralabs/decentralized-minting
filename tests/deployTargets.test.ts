import { describe, expect, it } from "vitest";

import { getSlotAnchor } from "../src/contracts/config.js";
import { getMintingDataSpendValidator, getMintV1WithdrawValidator } from "../src/contracts/validators.js";
import { loadDesiredDeploymentState } from "../src/deploymentState.js";

// Invariant: a testnet deploy target is exactly what the committed blueprint produces for that network.
// Failure mode caught: a contract change (new blueprint) whose per-network targets were not re-derived,
// so the settings tx would point demi@handle_settings at a script nobody can deploy or spend.
// Negative control: with the #50 blueprints (35b3ba5) these targets fail (they derive 92367457/74b2c62e).
// Mainnet is intentionally not asserted: its target stays at #50 until the operator decides whether the
// pending mainnet v2 batch carries BurnLabeledRoots (#53).
describe("testnet deploy targets match the committed blueprint", () => {
  for (const network of ["preview", "preprod"] as const) {
    it(`${network}: minting_data_script_hash and mint_governor are derived from the blueprint`, async () => {
      const desired = await loadDesiredDeploymentState(`deploy/${network}/decentralized-minting.yaml`);
      const { legacyPolicyId, adminVerificationKeyHash } = desired.buildParameters;
      const anchor = getSlotAnchor(network);
      const mintingData = getMintingDataSpendValidator(
        legacyPolicyId,
        adminVerificationKeyHash,
        anchor.anchor_slot,
        anchor.anchor_time_ms,
        anchor.slot_length_ms,
      );
      const settings = desired.settings.values["demi@handle_settings"];
      expect(settings.minting_data_script_hash).toBe(mintingData.scriptHash);
      expect(settings.mint_governor).toBe(getMintV1WithdrawValidator(mintingData.scriptHash).scriptHash);
    });
  }
});
