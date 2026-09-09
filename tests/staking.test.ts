import { describe, expect, it } from "vitest";
import type { Cardano as CardanoTypes } from "@cardano-sdk/core";

import { Cardano, Serialization } from "../src/helpers/cardano-sdk/index.js";
import { registerStakingAddress } from "../src/txs/staking.js";

const ADDRESS = "addr1v8tq9j8f2nmqd6756e4l3n5sp0jk762al6syz6ku3xy2nec27ft6s";
const REWARD = "stake17xparg78q8vgxvhd44klpnqvll9hgy47qfm56w8lx03rq2c47ddsc";
const INPUT_COINS = 10_000_000n;
const DEPOSIT = 2_000_000n;

const protocolParameters = {
  coinsPerUtxoByte: 4310,
  maxTxSize: 16384,
  maxBlockBodySize: 90112,
  maxBlockHeaderSize: 1100,
  stakeKeyDeposit: Number(DEPOSIT),
  poolDeposit: 500_000_000,
  poolRetirementEpochBound: 18,
  desiredNumberOfPools: 500,
  poolInfluence: "0.3",
  monetaryExpansion: "0.003",
  treasuryExpansion: "0.2",
  minPoolCost: 170_000_000,
  protocolVersion: { major: 10, minor: 0 },
  maxValueSize: 5000,
  collateralPercentage: 150,
  maxCollateralInputs: 3,
  costModels: new Map(),
  prices: { memory: 0.0577, steps: 0.0000721 },
  maxExecutionUnitsPerTransaction: { memory: 14_000_000, steps: 10_000_000_000 },
  maxExecutionUnitsPerBlock: { memory: 62_000_000, steps: 20_000_000_000 },
  minFeeCoefficient: 44,
  minFeeConstant: 155381,
  minFeeRefScriptCostPerByte: "15"
} as CardanoTypes.ProtocolParameters;

const input: CardanoTypes.Utxo = [
  { txId: Cardano.TransactionId("1".repeat(64)), index: 0 },
  { address: Cardano.PaymentAddress(ADDRESS), value: { coins: INPUT_COINS } }
];

describe("registerStakingAddress", () => {
  it("reserves the stake-key deposit during coin selection", async () => {
    // Invariant: input coin equals change + fee + the protocol stake-key deposit.
    // Failure caught: without implicitValue.coin.deposit the node rejects the tx as
    // ValueNotConservedUTxO, short by exactly 2 ADA (the real mainnet failure).
    const cbor = await registerStakingAddress({
      network: "mainnet",
      changeAddress: ADDRESS,
      spareUtxos: [input],
      bech32StakingAddress: REWARD,
      blockfrostApiKey: "unused",
      getBuildContext: async () => ({ protocolParameters, validityInterval: {} })
    });

    const tx = Serialization.Transaction.fromCbor(cbor as CardanoTypes.HexBlob).toCore();
    const change = tx.body.outputs.reduce((sum, output) => sum + output.value.coins, 0n);
    expect(INPUT_COINS).toBe(change + tx.body.fee + DEPOSIT);
    expect(tx.body.certificates).toHaveLength(1);
    expect(tx.body.certificates?.[0].__typename).toBe(Cardano.CertificateType.StakeRegistration);

    // Negative control: the old implementation produced change + fee == all input,
    // leaving zero for the deposit and failing this exact conservation equation.
    expect(INPUT_COINS).not.toBe(change + tx.body.fee);
  });
});
