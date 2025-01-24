import { Blockfrost, Core, HotWallet } from "@blaze-cardano/sdk";
import * as handle from "./types/handle-mint.js";

// Convert a network into the blockfrost format
export function blockfrost_network(): "cardano-mainnet" | "cardano-preview" {
  switch (process.env.NETWORK) {
    case "mainnet":
      return "cardano-mainnet";
    case "preview":
      return "cardano-preview";
    default:
      return "cardano-preview";
  }
}
// Convert a network into the blaze format
export function network_id(): Core.NetworkId {
  switch (process.env.NETWORK) {
    case "mainnet":
      return Core.NetworkId.Mainnet;
    default:
      return Core.NetworkId.Testnet;
  }
}

// Load the wallet from the MNEMONIC environment variable
export async function load_wallet(provider: Blockfrost): Promise<HotWallet> {
  const mnemonic = process.env.MNEMONIC!;
  const entropy = Core.mnemonicToEntropy(mnemonic, Core.wordlist);
  const masterkey = Core.Bip32PrivateKey.fromBip39Entropy(
    Buffer.from(entropy),
    ""
  );
  return HotWallet.fromMasterkey(masterkey.hex(), provider);
}

// Data.Void
export const plutusVoid = () =>
  Core.PlutusData.fromCbor(Core.HexBlob("d87980"));

export function address_to_address(
  address: typeof handle.OrderSpend.datum.destination.address
): Core.Address {
  let payment_credential_type;
  let payment_credential_hash;
  if ("ScriptCredential" in address.paymentCredential) {
    payment_credential_type = 1 << 0;
    payment_credential_hash = address.paymentCredential.ScriptCredential[0];
  } else {
    payment_credential_type = 0 << 0;
    payment_credential_hash =
      address.paymentCredential.VerificationKeyCredential[0];
  }
  let stake_credential_type;
  let stake_credential_hash;
  let stake_credential_pointer;
  if (address.stakeCredential === null) {
    stake_credential_type = 3 << 1;
    stake_credential_hash = undefined;
  } else {
    if ("Pointer" in address.stakeCredential) {
      stake_credential_type = 2 << 1;
      stake_credential_pointer = address.stakeCredential.Pointer;
    } else if ("ScriptCredential" in address.stakeCredential.Inline[0]) {
      stake_credential_type = 1 << 1;
      stake_credential_hash =
        address.stakeCredential.Inline[0].ScriptCredential[0];
    } else {
      stake_credential_type = 0 << 1;
      stake_credential_hash =
        address.stakeCredential.Inline[0].VerificationKeyCredential[0];
    }
  }
  let address_type: Core.AddressType =
    stake_credential_type | payment_credential_type;
  // TODO: doesn't support pointer addresses'
  return new Core.Address({
    type: address_type,
    networkId: network_id(),
    paymentPart: {
      type: payment_credential_type,
      hash: Core.Hash28ByteBase16(payment_credential_hash),
    },
    delegationPart: !stake_credential_hash
      ? undefined
      : {
          type: stake_credential_type,
          hash: Core.Hash28ByteBase16(stake_credential_hash),
        },
  });
}

export function proof_to_proof(
  proof: any
): (typeof handle.MintV1Withdraw.proofs)[0] {
  let ret: (typeof handle.MintV1Withdraw.proofs)[0] = [];
  for (const step of proof) {
    switch (step.type) {
      case "branch": {
        ret.push({
          Branch: {
            skip: BigInt(step.skip),
            neighbors: step.neighbors,
          },
        });
        break;
      }
      case "fork": {
        ret.push({
          Fork: {
            skip: BigInt(step.skip),
            neighbor: step.neighbor,
          },
        });
        break;
      }
      case "leaf": {
        ret.push({
          Leaf: {
            skip: BigInt(step.skip),
            key: step.neighbor.key,
            value: step.neighbor.value,
          },
        });
        break;
      }
    }
  }
  return ret;
}
