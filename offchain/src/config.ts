import {
  makeAddress,
  makeAssetClass,
  makeMintingPolicyHash,
  makeStakingAddress,
  makeStakingValidatorHash,
  makeValidatorHash,
  TxOutputId,
} from "@helios-lang/ledger";

import { NETWORK, SETTINGS_UTF8_ASSET_NAME } from "./constants/index.js";
import {
  getMintProxyMintUplcProgram,
  getMintV1WithdrawUplcProgram,
  getOrderSpendUplcProgram,
  getSettingsProxyMintUplcProgram,
  getSettingsProxySpendUplcProgram,
  getSettingsV1StakeUplcProgram,
} from "./contracts/index.js";

const buildContractsConfig = (initialTxOutputId: TxOutputId) => {
  const isMainnet = NETWORK == "mainnet";

  const settingsProxySpendUplcProgram =
    getSettingsProxySpendUplcProgram(initialTxOutputId);
  const settingsProxyMintUplcProgram =
    getSettingsProxyMintUplcProgram(initialTxOutputId);
  const settingsProxyPolicyHash = makeMintingPolicyHash(
    settingsProxyMintUplcProgram.hash()
  );
  const settingsProxyAssetClass = makeAssetClass(
    settingsProxyPolicyHash,
    Buffer.from(SETTINGS_UTF8_ASSET_NAME)
  );
  const settingsProxyScriptAddress = makeAddress(
    isMainnet,
    makeValidatorHash(settingsProxyMintUplcProgram.hash())
  );

  const settingsV1StakeUplcProgram = getSettingsV1StakeUplcProgram();
  const settingsV1StakingAddress = makeStakingAddress(
    isMainnet,
    makeStakingValidatorHash(settingsV1StakeUplcProgram.hash())
  );

  const orderSpendUplcProgram = getOrderSpendUplcProgram(
    settingsProxyPolicyHash.toHex()
  );
  const orderScriptHash = makeValidatorHash(orderSpendUplcProgram.hash());
  const orderScriptAddress = makeAddress(isMainnet, orderScriptHash);

  const mintProxyMintUplcProgram = getMintProxyMintUplcProgram(
    settingsProxyPolicyHash.toHex()
  );
  const mintProxyPolicyHash = makeMintingPolicyHash(
    mintProxyMintUplcProgram.hash()
  );
  const handlePolicyHash = mintProxyPolicyHash;

  const mintV1WithdrawUplcProgram = getMintV1WithdrawUplcProgram(
    settingsProxyPolicyHash.toHex(),
    orderScriptHash.toHex()
  );
  const mintV1StakingAddress = makeStakingAddress(
    isMainnet,
    makeStakingValidatorHash(mintV1WithdrawUplcProgram.hash())
  );

  return {
    settingsProxy: {
      settingsProxySpendUplcProgram,
      settingsProxyMintUplcProgram,
      settingsProxyPolicyHash,
      settingsProxyAssetClass,
      settingsProxyScriptAddress,
    },
    settingsV1: {
      settingsV1StakeUplcProgram,
      settingsV1StakingAddress,
    },
    order: {
      orderSpendUplcProgram,
      orderScriptHash,
      orderScriptAddress,
    },
    mintProxy: {
      mintProxyMintUplcProgram,
      mintProxyPolicyHash,
    },
    mintV1: {
      mintV1WithdrawUplcProgram,
      mintV1StakingAddress,
    },
    handlePolicyHash,
  };
};

export { buildContractsConfig };
