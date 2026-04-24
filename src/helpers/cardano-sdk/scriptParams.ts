import { Buffer } from "node:buffer";
import { createRequire } from "node:module";

import type { HexBlob } from "./index.js";
import { Serialization } from "./index.js";

// scalus ships as CJS with a namespace export; load via require for
// a reliable ESM-interop shape.
const require = createRequire(import.meta.url);
 
const { Scalus } = require("scalus") as {
  Scalus: {
    applyDataArgToScript: (doubleCborHex: string, dataJson: string) => string;
  };
};

/**
 * Plutus Data JSON format accepted by `scalus.applyDataArgToScript`.
 *
 * The JSON shape is the canonical Plutus Data JSON used by the Cardano node
 * / CLI. `int` must be a JSON number — scalus's pickle JSON parser rejects
 * strings. Values larger than `Number.MAX_SAFE_INTEGER` should go through a
 * different encoding (split into constr fields or use bytes).
 */
export type PlutusDataJson =
  | { int: number }
  | { bytes: string }
  | { constructor: number; fields: PlutusDataJson[] }
  | { list: PlutusDataJson[] }
  | { map: { k: PlutusDataJson; v: PlutusDataJson }[] };

/**
 * Detect whether a script-cbor hex string is in the on-chain double-CBOR
 * form (byte string of byte string of flat UPLC) or the single-CBOR form
 * Blockfrost's `/scripts/{hash}/cbor` returns. Wraps once if needed.
 * Symmetric counterpart to `plutusV2ScriptHash`'s auto-detect branch —
 * use this whenever you're about to call
 * `Serialization.PlutusV2Script.fromCbor(hex)` with CBOR from an external
 * source that might be single-wrapped.
 */
export const ensureDoubleCbor = (cborHex: string): string => {
  const bytes = Buffer.from(cborHex, "hex");
  if (bytes.length === 0) throw new Error("empty script cbor");
  const outerMt = bytes[0] >> 5;
  if (outerMt !== 2) throw new Error("expected CBOR byte string as script input");
  const ai = bytes[0] & 0x1f;
  let headerLen: number;
  if (ai <= 23) headerLen = 1;
  else if (ai === 24) headerLen = 2;
  else if (ai === 25) headerLen = 3;
  else if (ai === 26) headerLen = 5;
  else if (ai === 27) headerLen = 9;
  else throw new Error(`unsupported CBOR byte string length encoding: ${ai}`);
  const innerMt = bytes[headerLen] >> 5;
  return innerMt === 2 ? cborHex : toDoubleCbor(cborHex);
};

/**
 * Wrap a CBOR byte string with another byte string header. Aiken blueprint
 * `compiledCode` is single-CBOR-encoded (one byte-string wrapper around the
 * flat UPLC). Both scalus's `applyDataArgToScript` and cardano-sdk's
 * `PlutusV2Script.fromCbor` expect the double-CBOR form (byte string of
 * byte string of flat UPLC), so we wrap once.
 */
const toDoubleCbor = (singleCborHex: string): string => {
  const bytes = Buffer.from(singleCborHex, "hex");
  const len = bytes.length;
  let header: Buffer;
  if (len <= 23) header = Buffer.from([0x40 | len]);
  else if (len <= 0xff) header = Buffer.from([0x58, len]);
  else if (len <= 0xffff)
    header = Buffer.from([0x59, (len >> 8) & 0xff, len & 0xff]);
  else
    header = Buffer.from([
      0x5a,
      (len >> 24) & 0xff,
      (len >> 16) & 0xff,
      (len >> 8) & 0xff,
      len & 0xff,
    ]);
  return Buffer.concat([header, bytes]).toString("hex");
};

/**
 * Apply one or more Plutus data arguments to a compiled Aiken validator,
 * producing a new parameterized validator as a *double*-CBOR hex string
 * suitable for direct consumption by `Serialization.PlutusV2Script.fromCbor`.
 *
 * Replaces helios's `UplcProgramV2.apply([...params])`. Scalus consumes and
 * returns double-CBOR; we wrap the blueprint's single-CBOR form once at
 * entry and emit the result unchanged.
 */
export const applyParamsToScript = (
  blueprintCompiledCodeHex: string,
  params: PlutusDataJson[],
): string => {
  let applied = toDoubleCbor(blueprintCompiledCodeHex);
  for (const param of params) {
    applied = Scalus.applyDataArgToScript(applied, JSON.stringify(param));
  }
  return applied;
};

/**
 * Convert a `PlutusDataJson` to the cardano-sdk Core `PlutusData` shape.
 * The Core shape is a structural union over `bigint`, `Uint8Array`, and
 * plain objects/maps/lists.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const plutusDataJsonToCore = (json: PlutusDataJson): any => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = json as any;
  if (typeof j.int === "number") return BigInt(j.int);
  if (typeof j.bytes === "string") return Buffer.from(j.bytes, "hex");
  if (typeof j.constructor === "number" && Array.isArray(j.fields)) {
    return {
      constructor: BigInt(j.constructor),
      fields: j.fields.map(plutusDataJsonToCore),
    };
  }
  if (Array.isArray(j.list)) return j.list.map(plutusDataJsonToCore);
  if (Array.isArray(j.map)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = new Map<any, any>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const entry of j.map as { k: any; v: any }[]) {
      m.set(plutusDataJsonToCore(entry.k), plutusDataJsonToCore(entry.v));
    }
    return m;
  }
  throw new Error("invalid PlutusDataJson");
};

/**
 * Encode a `PlutusDataJson` as a CBOR hex string, compatible with what the
 * on-chain script expects. Useful for building inline datums and redeemers.
 */
export const plutusDataJsonToCbor = (json: PlutusDataJson): string =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Serialization as any)
    .PlutusData.fromCore(plutusDataJsonToCore(json))
    .toCbor() as string;

/**
 * Compute the blake2b-224 script hash of a PlutusV2 script. Accepts either
 * the blueprint single-CBOR form or the on-chain double-CBOR form — detects
 * which and wraps if needed.
 */
export const plutusV2ScriptHash = (cborHex: string): string =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Serialization as any)
    .PlutusV2Script.fromCbor(ensureDoubleCbor(cborHex) as HexBlob)
    .hash() as string;
