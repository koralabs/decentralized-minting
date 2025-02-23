import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import { bytesToHex } from "@helios-lang/codec-utils";
import { Ok, Result } from "ts-res";

import { buildMintingData, MintingData } from "../contracts/index.js";

/**
 * @interface
 * @typedef {object} GetMintingDataCBORParams
 * @property {Trie} db MPF Database for all handles
 */
interface GetMintingDataCBORParams {
  db: Trie;
}

/**
 * @description Build Minting Data Datum's CBOR
 * @param {GetMintingDataCBORParams} params
 * @returns {Promise<Result<string,  Error>>} CBOR Result
 */

const getMintingDataCBOR = async (
  params: GetMintingDataCBORParams
): Promise<Result<string, Error>> => {
  const { db } = params;

  // we already have settings asset using legacy handle.
  const mintingData: MintingData = {
    mpt_root_hash: db.hash.toString("hex"),
  };

  return Ok(bytesToHex(buildMintingData(mintingData).toCbor()));
};

export { getMintingDataCBOR };
export type { GetMintingDataCBORParams };
