import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import { bytesToHex } from "@helios-lang/codec-utils";
import { Address } from "@helios-lang/ledger";
import { NetworkName } from "@helios-lang/tx-utils";
import { GET_CONFIGS } from "configs/index.js";
import { mayFail } from "helpers/index.js";
import { Err, Ok, Result } from "ts-res";

import {
  buildContracts,
  buildMintingData,
  MintingData,
} from "../contracts/index.js";

/**
 * @interface
 * @typedef {object} GetMintingDataCBORParams
 * @property {NetworkName} network Network
 * @property {Trie} db MPF Database for all handles
 */
interface GetMintingDataCBORParams {
  network: NetworkName;
  db: Trie;
}

/**
 * @description Build Minting Data Datum's CBOR
 * @param {GetMintingDataCBORParams} params
 * @returns {Promise<Result<string,  Error>>} CBOR Result
 */

const getMintingDataCBOR = async (
  params: GetMintingDataCBORParams
): Promise<Result<{ cbor: string; lockAddress: Address }, Error>> => {
  const { network, db } = params;
  const configsResult = mayFail(() => GET_CONFIGS(network));
  if (!configsResult.ok) return Err(new Error(configsResult.error));
  const { MINT_VERSION, GOD_VERIFICATION_KEY_HASH } = configsResult.data;

  const contractsConfig = buildContracts({
    network,
    mint_version: MINT_VERSION,
    god_verification_key_hash: GOD_VERIFICATION_KEY_HASH,
  });
  const { mintingData: mintingDataConfig } = contractsConfig;

  // we already have settings asset using legacy handle.
  const mintingData: MintingData = {
    mpt_root_hash: db.hash.toString("hex"),
  };

  return Ok({
    cbor: bytesToHex(buildMintingData(mintingData).toCbor()),
    lockAddress: mintingDataConfig.mintingDataProxyValidatorAddress,
  });
};

export { getMintingDataCBOR };
export type { GetMintingDataCBORParams };
