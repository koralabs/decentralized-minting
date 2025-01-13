import { Core } from "@blaze-cardano/sdk";
import * as contracts from "./types/handle-mint";
import { network_id } from "./utils";

export function build_contracts(transaction_id: string, output: bigint) {
  let init_utxo = {
    transactionId: { hash: transaction_id },
    outputIndex: output,
  };
  const settings_proxy = new contracts.SettingsProxyMint(init_utxo);
  const settings_v1 = new contracts.SettingsV1Stake();
  const order = new contracts.OrderSpend(settings_proxy.hash());
  const mint_proxy = new contracts.MintProxyMint(settings_proxy.hash());
  const mint_v1 = new contracts.MintV1Withdraw(
    settings_proxy.hash(),
    order.hash(),
  );
  const settings_policy = Core.PolicyId(settings_proxy.hash());
  const settings_asset_name = Core.AssetName(
    Core.toHex(Buffer.from("ADA Handle Settings")),
  );
  const settings_asset_id = Core.AssetId.fromParts(
    settings_policy,
    settings_asset_name,
  );
  const settings_address: Core.Address = new Core.Address({
    type: Core.AddressType.EnterpriseScript,
    networkId: network_id(),
    paymentPart: {
      type: Core.CredentialType.ScriptHash,
      hash: settings_proxy.hash(),
    },
  });
  const order_address: Core.Address = new Core.Address({
    type: Core.AddressType.EnterpriseScript,
    networkId: network_id(),
    paymentPart: {
      type: Core.CredentialType.ScriptHash,
      hash: order.hash(),
    },
  });
  const handle_policy_id = Core.PolicyId(mint_proxy.hash());
  const mint_v1_withdraw = Core.RewardAccount.fromCredential(
    { type: Core.CredentialType.ScriptHash, hash: mint_v1.hash() },
    network_id(),
  );
  const settings_v1_withdraw = Core.RewardAccount.fromCredential(
    { type: Core.CredentialType.ScriptHash, hash: settings_v1.hash() },
    network_id(),
  );
  const mint_v1_credential = Core.Credential.fromCore({
    type: Core.CredentialType.ScriptHash,
    hash: mint_v1.hash(),
  });
  const settings_v1_credential = Core.Credential.fromCore({
    type: Core.CredentialType.ScriptHash,
    hash: settings_v1.hash(),
  });
  return {
    scripts: {
      settings_proxy,
      settings_v1,
      mint_proxy,
      mint_v1,
      order,
    },
    utils: {
      settings_policy,
      settings_asset_name,
      settings_asset_id,
      settings_address,
      order_address,
      mint_v1_withdraw,
      settings_v1_withdraw,
      mint_v1_credential,
      settings_v1_credential,
      handle_policy_id,
    },
  };
}
