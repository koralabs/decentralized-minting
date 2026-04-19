import "./conwayEra.js";

import { Buffer } from "node:buffer";
import { createRequire } from "node:module";

import type { Cardano as CardanoTypes } from "@cardano-sdk/core";

import { Cardano, Serialization } from "./index.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { blake2b } = require("@cardano-sdk/crypto") as any;

type CostModels = Map<CardanoTypes.PlutusLanguageVersion, number[]>;

/**
 * Conway-aware replacement for `@cardano-sdk/tx-construction`'s
 * `computeScriptDataHash`.
 *
 * The upstream SDK re-serialises redeemers as an Alonzo-era CBOR **array**
 * when computing the script-data hash, even though the witness set already
 * encodes them as a Conway-era CBOR **map**. The Cardano node hashes the
 * bytes that actually appear in the witness set (map format on Conway), so
 * the two hashes diverge and every submitted tx gets rejected with
 * PPViewHashesDontMatch.
 *
 * This function builds the redeemer CBOR in MAP form directly, matching what
 * the node computes.
 *
 * Ported from handle.me/bff/lib/cardano/computeScriptDataHash.ts.
 */
export const computeScriptDataHash = (
  costModels: CostModels,
  usedLanguages: CardanoTypes.PlutusLanguageVersion[],
  redeemers?: CardanoTypes.Redeemer[],
  datums?: CardanoTypes.PlutusData[],
): string | undefined => {
  if (
    (!redeemers || redeemers.length === 0) &&
    (!datums || datums.length === 0)
  ) {
    return undefined;
  }

  // Build the cost-model language views for only the languages actually used.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requiredCostModels = new (Serialization as any).Costmdls();
  for (const language of usedLanguages) {
    const costModel = costModels.get(language);
    if (costModel) {
      requiredCostModels.insert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new (Serialization as any).CostModel(language, costModel),
      );
    }
  }

  const languageViewsHex: string = requiredCostModels.languageViewsEncoding();

  // Conway redeemers must be MAP-encoded: { [tag, index] => [data, ex_units] }.
  let redeemersCborHex: string | undefined;
  if (redeemers && redeemers.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writer = new (Serialization as any).CborWriter();
    writer.writeStartMap(redeemers.length);
    for (const redeemer of redeemers) {
      writer.writeStartArray(2);
      const tag =
        redeemer.purpose === Cardano.RedeemerPurpose.spend
          ? 0
          : redeemer.purpose === Cardano.RedeemerPurpose.mint
            ? 1
            : redeemer.purpose === Cardano.RedeemerPurpose.certificate
              ? 2
              : 3;
      writer.writeInt(tag);
      writer.writeInt(redeemer.index);
      writer.writeStartArray(2);
      writer.writeEncodedValue(
        Uint8Array.from(
          Buffer.from(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (Serialization as any).PlutusData.fromCore(redeemer.data).toCbor(),
            "hex",
          ),
        ),
      );
      writer.writeStartArray(2);
      writer.writeInt(Number(redeemer.executionUnits.memory));
      writer.writeInt(Number(redeemer.executionUnits.steps));
    }
    redeemersCborHex = Buffer.from(writer.encode()).toString("hex");
  }

  // Serialise datums the same way the upstream SDK does.
  let datumsCborHex: string | undefined;
  if (datums && datums.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writer = new (Serialization as any).CborWriter();
    writer.writeStartArray(datums.length);
    for (const datum of datums) {
      writer.writeEncodedValue(
        Uint8Array.from(
          Buffer.from(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (Serialization as any).PlutusData.fromCore(datum).toCbor(),
            "hex",
          ),
        ),
      );
    }
    datumsCborHex = Buffer.from(writer.encode()).toString("hex");
  }

  // Hash according to the Alonzo/Conway spec:
  //   If there are redeemers:  hash( redeemers || [datums] || language_views )
  //   If only datums:          hash( empty_map || datums || empty_map )
  const CBOR_EMPTY_MAP = "a0";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writer = new (Serialization as any).CborWriter();

  if (datumsCborHex && !redeemersCborHex) {
    writer.writeEncodedValue(
      Uint8Array.from(Buffer.from(CBOR_EMPTY_MAP, "hex")),
    );
    writer.writeEncodedValue(Uint8Array.from(Buffer.from(datumsCborHex, "hex")));
    writer.writeEncodedValue(
      Uint8Array.from(Buffer.from(CBOR_EMPTY_MAP, "hex")),
    );
  } else {
    if (!redeemersCborHex) return undefined;
    writer.writeEncodedValue(
      Uint8Array.from(Buffer.from(redeemersCborHex, "hex")),
    );
    if (datumsCborHex) {
      writer.writeEncodedValue(
        Uint8Array.from(Buffer.from(datumsCborHex, "hex")),
      );
    }
    writer.writeEncodedValue(
      Uint8Array.from(Buffer.from(languageViewsHex, "hex")),
    );
  }

  const encoded = Buffer.from(writer.encode()).toString("hex");
  return blake2b.hash(encoded, 32) as string;
};
