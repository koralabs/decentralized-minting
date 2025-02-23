import { BlockFrostAPI } from "@blockfrost/blockfrost-js";
import { bytesToHex } from "@helios-lang/codec-utils";
import {
  makeAddress,
  makeInlineTxOutputDatum,
  makeTxOutput,
  makeValidatorHash,
  makeValue,
} from "@helios-lang/ledger";
import {
  makeBlockfrostV0Client,
  makeTxBuilder,
  NetworkName,
} from "@helios-lang/tx-utils";
import { Err, Result } from "ts-res";

import { GET_CONFIGS } from "../configs/index.js";
import { buildContracts, makeVoidData } from "../contracts/index.js";
import {
  BuildTxError,
  mayFail,
  mayFailTransaction,
  TxSuccessResult,
} from "../helpers/index.js";
import {
  checkAccountRegistrationStatus,
  createAlwaysFailUplcProgram,
} from "../utils/index.js";
import { WalletWithoutKey } from "./types.js";

/**
 * @interface
 * @typedef {object} DeployParams
 * @property {NetworkName} network Network
 * @property {WalletWithoutKey} walletWithoutKey Wallet without key, used to build transaction
 */
interface DeployParams {
  network: NetworkName;
  walletWithoutKey: WalletWithoutKey;
}

/**
 * @description Deploy De-Mi contracts (Mint V1 and Minting Data V1 Validators)
 * @param {DeployParams} params
 * @param {string} blockfrostApiKey Blockfrost API Key
 * @returns {Promise<Result<TxSuccessResult,  Error | BuildTxError>>} Transaction Result
 */
const deploy = async (
  params: DeployParams,
  blockfrostApiKey: string
): Promise<Result<TxSuccessResult, Error | BuildTxError>> => {
  const { network, walletWithoutKey } = params;
  const configsResult = mayFail(() => GET_CONFIGS(network));
  if (!configsResult.ok) return Err(new Error(configsResult.error));
  const { MINT_VERSION, GOD_VERIFICATION_KEY_HASH } = configsResult.data;

  const { address, utxos, collateralUtxo } = walletWithoutKey;
  if (address.era == "Byron")
    return Err(new Error("Byron Address not supported"));
  const isMainnet = network == "mainnet";

  const blockfrostV0Client = makeBlockfrostV0Client(network, blockfrostApiKey);
  const blockfrostApi = new BlockFrostAPI({ projectId: blockfrostApiKey });
  const networkParams = await blockfrostV0Client.parameters;

  const contractsConfig = buildContracts({
    network,
    mint_version: MINT_VERSION,
    god_verification_key_hash: GOD_VERIFICATION_KEY_HASH,
  });
  const {
    mintV1: mintV1Config,
    mintingDataV1: mintingDataV1Config,
    mintingData,
  } = contractsConfig;

  const alwaysFailUplcProgram = createAlwaysFailUplcProgram();
  const alwaysFailUplcProgramAddress = makeAddress(
    isMainnet,
    makeValidatorHash(alwaysFailUplcProgram.hash())
  );

  // start building tx
  const txBuilder = makeTxBuilder({
    isMainnet,
  });

  // <-- lock reference script (mint v1) to always fail uplc program
  const mintV1ReferenceOutput = makeTxOutput(
    alwaysFailUplcProgramAddress,
    makeValue(2_000_000n),
    makeInlineTxOutputDatum(makeVoidData()),
    mintV1Config.mintV1WithdrawUplcProgram
  );
  mintV1ReferenceOutput.correctLovelace(networkParams);
  txBuilder.addOutput(mintV1ReferenceOutput);

  // <-- lock reference script (minting data v1) to always fail uplc program
  const mintingDataV1ReferenceOutput = makeTxOutput(
    alwaysFailUplcProgramAddress,
    makeValue(2_000_000n),
    makeInlineTxOutputDatum(makeVoidData()),
    mintingDataV1Config.mintingDataV1WithdrawUplcProgram
  );
  mintingDataV1ReferenceOutput.correctLovelace(networkParams);
  txBuilder.addOutput(mintingDataV1ReferenceOutput);

  // <-- register mint v1 staking address
  // after check staking address is already registered or not
  const mintV1StakingAddressRegistered =
    (await checkAccountRegistrationStatus(
      blockfrostApi,
      mintV1Config.mintV1StakingAddress.toBech32()
    )) == "registered";
  if (!mintV1StakingAddressRegistered)
    txBuilder.addDCert(mintV1Config.mintV1RegistrationDCert);

  // <-- register minting data v1 staking address
  // after check staking address is already registered or not
  const mintingDataV1StakingAddressRegistered =
    (await checkAccountRegistrationStatus(
      blockfrostApi,
      mintingDataV1Config.mintingDataV1StakingAddress.toBech32()
    )) == "registered";
  if (!mintingDataV1StakingAddressRegistered)
    txBuilder.addDCert(mintingDataV1Config.mintingDataV1RegistrationDCert);

  console.log(
    Buffer.from(mintingData.mintingDataProxySpendUplcProgram.toCbor()).toString(
      "hex"
    )
  );

  // <-- use collateral
  if (collateralUtxo) txBuilder.addCollateral(collateralUtxo);

  const txResult = await mayFailTransaction(
    txBuilder,
    address,
    utxos
  ).complete();
  if (txResult.ok) {
    console.log("!!NOTE!!");
    console.log(
      "Save thess TxOutputIds. Thess are where Mint V1 and Minting Data V1 Ref Scripts are attached"
    );
    console.log(
      `\n\nMint V1 Ref Script:\n${bytesToHex(txResult.data.tx.body.hash())}#0\n`
    );
    console.log(
      `\nMinting Data V1 Ref Script:\n${bytesToHex(
        txResult.data.tx.body.hash()
      )}#1\n\n`
    );
  }
  return txResult;
};

export type { DeployParams };
export { deploy };
