import type { Cardano as CardanoTypes } from "@cardano-sdk/core";
import { roundRobinRandomImprove, type SelectionSkeleton } from "@cardano-sdk/input-selection";
import {
  createTransactionInternals,
  defaultSelectionConstraints,
  GreedyTxEvaluator,
} from "@cardano-sdk/tx-construction";

import {
  type BlockfrostBuildContext,
  getBlockfrostBuildContext,
} from "../helpers/cardano-sdk/blockfrostContext.js";
import {
  asPaymentAddress,
  buildPlaceholderSignatures,
  Cardano,
  type NetworkName,
  transactionToCbor,
} from "../helpers/cardano-sdk/index.js";

/**
 * Register a staking credential. Returns unsigned tx CBOR.
 */
const registerStakingAddress = async ({
  network,
  changeAddress,
  spareUtxos,
  bech32StakingAddress,
  blockfrostApiKey,
}: {
  network: NetworkName;
  changeAddress: string;
  spareUtxos: CardanoTypes.Utxo[];
  bech32StakingAddress: string;
  blockfrostApiKey: string;
}): Promise<string> => {
  const buildContext = await getBlockfrostBuildContext(network, blockfrostApiKey);
  const changeAddressBech32 = asPaymentAddress(changeAddress);

  // Parse staking credential from the reward account bech32
  const rewardAccount = bech32StakingAddress as CardanoTypes.RewardAccount;
  const credential = Cardano.RewardAccount.toHash(rewardAccount);
  const credentialType = Cardano.RewardAccount(rewardAccount).startsWith("stake_script")
    ? Cardano.CredentialType.ScriptHash
    : Cardano.CredentialType.KeyHash;

  const certificate: CardanoTypes.StakeAddressCertificate = {
    __typename: Cardano.CertificateType.StakeRegistration,
    stakeCredential: {
      type: credentialType,
      hash: credential as CardanoTypes.Credential["hash"],
    },
  };

  return finalizeTx({
    preSelected: [],
    utxos: spareUtxos,
    outputs: [],
    certificates: [certificate],
    changeAddress: changeAddressBech32 as string,
    buildContext,
  });
};

const finalizeTx = async ({
  preSelected,
  utxos,
  outputs,
  certificates,
  changeAddress,
  buildContext,
}: {
  preSelected: CardanoTypes.Utxo[];
  utxos: CardanoTypes.Utxo[];
  outputs: CardanoTypes.TxOut[];
  certificates?: CardanoTypes.Certificate[];
  changeAddress: string;
  buildContext: BlockfrostBuildContext;
}): Promise<string> => {
  const changeAddressBech32 = asPaymentAddress(changeAddress);
  const inputSelector = roundRobinRandomImprove({
    changeAddressResolver: {
      resolve: async (selection) =>
        selection.change.map((change) => ({
          ...change,
          address: changeAddressBech32,
        })),
    },
  });

  const txEvaluator = new GreedyTxEvaluator(async () => buildContext.protocolParameters);

  const buildForSelection = (selection: SelectionSkeleton): Promise<CardanoTypes.Tx> =>
    Promise.resolve(buildBody(selection, outputs, certificates));

  const selection = await inputSelector.select({
    preSelectedUtxo: new Set(preSelected),
    utxo: new Set(utxos),
    outputs: new Set(outputs),
    constraints: defaultSelectionConstraints({
      protocolParameters: buildContext.protocolParameters,
      buildTx: buildForSelection,
      redeemersByType: {},
      txEvaluator,
    }),
  });

  const final = buildBody(selection.selection, outputs, certificates);
  return transactionToCbor(final);
};

const buildBody = (
  selection: SelectionSkeleton,
  outputs: CardanoTypes.TxOut[],
  certificates?: CardanoTypes.Certificate[],
): CardanoTypes.Tx => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = createTransactionInternals({ inputSelection: selection, outputs, certificates, validityInterval: {} } as any);
  return {
    id: body.hash as unknown as CardanoTypes.TransactionId,
    body: body.body,
    witness: { signatures: buildPlaceholderSignatures(1) },
  };
};

export { registerStakingAddress };
