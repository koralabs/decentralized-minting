import type { Cardano as CardanoTypes } from "@cardano-sdk/core";

import type { HexBlob } from "../helpers/cardano-sdk/index.js";
import { Cardano, type NetworkName } from "../helpers/cardano-sdk/index.js";
import type { AppliedPlutusV2Script } from "./validators.js";
import {
  getMintingDataSpendValidator,
  getMintProxyMintValidator,
  getMintV1WithdrawValidator,
  getOrdersSpendValidator,
} from "./validators.js";

/**
 * Contract build inputs, previously typed via `@helios-lang/tx-utils`. The
 * local `NetworkName` union and cardano-sdk primitives cover the same
 * information without the Helios dependency tree.
 */
interface BuildContractsParams {
  network: NetworkName;
  mint_version: bigint;
  legacy_policy_id: string;
  admin_verification_key_hash: string;
}

/**
 * All contract hashes/addresses a tx builder in this package might need.
 * Every field is either a hex string or a bech32 string — no Helios types.
 */
export interface BuiltContracts {
  mintProxy: {
    validator: AppliedPlutusV2Script;
    policyId: string;
  };
  mintingData: {
    validator: AppliedPlutusV2Script;
    validatorHash: string;
    scriptAddress: string;
  };
  mintV1: {
    validator: AppliedPlutusV2Script;
    validatorHash: string;
    stakingAddress: string;
    registrationCertificate: CardanoTypes.StakeAddressCertificate;
  };
  orders: {
    validator: AppliedPlutusV2Script;
    validatorHash: string;
    scriptAddress: string;
  };
  handlePolicyId: string;
}

const networkId = (network: NetworkName): 0 | 1 =>
  network === "mainnet" ? 1 : 0;

const scriptEnterpriseBech32 = (
  network: NetworkName,
  scriptHash: string,
): string => {
  const credential = {
    type: Cardano.CredentialType.ScriptHash,
    hash: scriptHash as unknown as CardanoTypes.Credential["hash"],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Cardano as any)
    .EnterpriseAddress.fromCredentials(networkId(network), credential)
    .toAddress()
    .toBech32() as string;
};

const scriptRewardAccountBech32 = (
  network: NetworkName,
  scriptHash: string,
): string => {
  const credential = {
    type: Cardano.CredentialType.ScriptHash,
    hash: scriptHash as unknown as CardanoTypes.Credential["hash"],
  };
  // `RewardAccount.fromCredentials` does not exist on @cardano-sdk/core@^0.46.12;
  // use the RewardAddress builder and project out its bech32, matching the
  // pattern in src/txs/prepareNewMint.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Cardano as any).RewardAddress.fromCredentials(
    networkId(network),
    credential,
  ).toAddress().toBech32() as string;
};

// WS7 — network slot->POSIX-time anchor for the $handle_policies sunset gate. Post-Shelley
// single-era conversion: posix_ms(slot) = anchor_time_ms + (slot - anchor_slot) * slot_length_ms.
// These are the public Shelley genesis anchors per network; only consequential once a sunset
// slot is set (the gate is open until then).
export const getSlotAnchor = (
  network: string,
): { anchor_slot: number; anchor_time_ms: number; slot_length_ms: number } => {
  switch (network.toLowerCase()) {
    case "preview":
      // all-Shelley: slot 0 == 2022-10-25T00:00:00Z
      return { anchor_slot: 0, anchor_time_ms: 1666656000000, slot_length_ms: 1000 };
    case "preprod":
      // Shelley start: slot 86400 == 2022-06-21T00:00:00Z
      return { anchor_slot: 86400, anchor_time_ms: 1655769600000, slot_length_ms: 1000 };
    default:
      // mainnet Shelley start: slot 4492800 == 2020-07-29T21:44:51Z
      return { anchor_slot: 4492800, anchor_time_ms: 1596059091000, slot_length_ms: 1000 };
  }
};

const buildContracts = (params: BuildContractsParams): BuiltContracts => {
  const {
    network,
    mint_version,
    legacy_policy_id,
    admin_verification_key_hash,
  } = params;

  // "demimntprx.mint"
  const mintProxy = getMintProxyMintValidator(mint_version);

  // "demimntmpt.spend"
  const anchor = getSlotAnchor(network);
  const mintingData = getMintingDataSpendValidator(
    legacy_policy_id,
    admin_verification_key_hash,
    anchor.anchor_slot,
    anchor.anchor_time_ms,
    anchor.slot_length_ms,
  );

  // "demimnt.withdraw"
  const mintV1 = getMintV1WithdrawValidator(mintingData.scriptHash);

  // "demiord.spend"
  const orders = getOrdersSpendValidator();

  const mintV1StakingAddress = scriptRewardAccountBech32(network, mintV1.scriptHash);
  const mintV1Credential = {
    type: Cardano.CredentialType.ScriptHash,
    hash: mintV1.scriptHash as unknown as CardanoTypes.Credential["hash"],
  };
  const mintV1RegistrationCertificate: CardanoTypes.StakeAddressCertificate = {
    __typename: Cardano.CertificateType.StakeRegistration,
    stakeCredential: mintV1Credential,
  };

  return {
    mintProxy: {
      validator: mintProxy,
      policyId: mintProxy.scriptHash,
    },
    mintingData: {
      validator: mintingData,
      validatorHash: mintingData.scriptHash,
      scriptAddress: scriptEnterpriseBech32(network, mintingData.scriptHash),
    },
    mintV1: {
      validator: mintV1,
      validatorHash: mintV1.scriptHash,
      stakingAddress: mintV1StakingAddress,
      registrationCertificate: mintV1RegistrationCertificate,
    },
    orders: {
      validator: orders,
      validatorHash: orders.scriptHash,
      scriptAddress: scriptEnterpriseBech32(network, orders.scriptHash),
    },
    handlePolicyId: mintProxy.scriptHash,
  };
};

// Silence "used-as-type-only" warning: we keep the HexBlob import so
// downstream callers can use the same brand without pulling @cardano-sdk/util.
export type { HexBlob };
export type { BuildContractsParams };
export { buildContracts };
