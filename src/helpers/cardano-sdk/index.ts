import "./conwayEra.js";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sdk = require("@cardano-sdk/core") as any;

// Runtime values — typed as `any` to avoid non-portable inferred type errors with CJS require.
// Consumers should use the CardanoTypes type import for compile-time type safety.
export const Cardano: typeof import("@cardano-sdk/core").Cardano = sdk.Cardano;
export const Serialization: typeof import("@cardano-sdk/core").Serialization = sdk.Serialization;

export type { Cardano as CardanoTypes } from "@cardano-sdk/core";
export type { HexBlob } from "@cardano-sdk/util";

type PaymentAddress = import("@cardano-sdk/core").Cardano.TxOut["address"];

export const asPaymentAddress = (address: string): PaymentAddress =>
  address as PaymentAddress;

export const buildPlaceholderSignatures = (signerCount: number) => {
  type Ed25519PublicKeyHex = import("@cardano-sdk/crypto").Ed25519PublicKeyHex;
  type Ed25519SignatureHex = import("@cardano-sdk/crypto").Ed25519SignatureHex;

  const signatures = new Map<Ed25519PublicKeyHex, Ed25519SignatureHex>();
  for (let index = 0; index < signerCount; index += 1) {
    const publicKey = `${index + 1}`.padStart(64, "0");
    const signature = `${index + 1}`.padStart(128, "0");
    signatures.set(publicKey as Ed25519PublicKeyHex, signature as Ed25519SignatureHex);
  }
  return signatures;
};

export const transactionToCbor = (tx: import("@cardano-sdk/core").Cardano.Tx): string =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Serialization.Transaction.fromCore(tx as any).toCbor() as string;

export const transactionHashFromCore = (tx: { body: import("@cardano-sdk/core").Cardano.TxBody }): string =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Serialization.TransactionBody.fromCore(structuredClone(tx.body) as any).hash() as string;

export {
  locateWitnessSet,
  mergeVkeysIntoTxCbor,
  skipCborItem,
  spliceVkeysIntoWitnessSet,
} from "./cborSplice.js";
export { computeScriptDataHash } from "./computeScriptDataHash.js";
export { getNetworkId, type NetworkName } from "./networkName.js";
export {
  applyParamsToScript,
  ensureDoubleCbor,
  type PlutusDataJson,
  plutusDataJsonToCbor,
  plutusDataJsonToCore,
  plutusV2ScriptHash,
} from "./scriptParams.js";
