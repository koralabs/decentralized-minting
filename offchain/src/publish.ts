import { Blaze, Blockfrost, Core, Data, Wallet } from "@blaze-cardano/sdk";
import { build_contracts } from "./contracts";
import * as handle from "./types/handle-mint";
import { network_id, plutusVoid } from "./utils";
import { promises as fs } from "fs";

export const publish_tx =
  (db: any) =>
  async (blaze: Blaze<Blockfrost, Wallet>): Promise<Core.Transaction> => {
    let utxos = await blaze.wallet.getUnspentOutputs();
    let seed = utxos[0];
    await fs.writeFile(
      "seed-utxo",
      Buffer.from(`${seed.input().transactionId()}#${seed.input().index()}`),
    );
    let contracts = build_contracts(
      seed.input().transactionId(),
      seed.input().index(),
    );

    let minter = (await blaze.wallet.getChangeAddress())
      .asBase()
      ?.getPaymentCredential().hash;
    if (!minter) {
      throw new Error("No minter address found");
    }
    let settings_v1_datum = Data.to(
      {
        allHandles: db.hash.toString("hex"),
        allowedMinters: [minter],
        minterFee: 1_000_000n,
        treasuryFee: 1_000_000n,
        policyId: contracts.scripts.mint_proxy.hash(),
        treasuryAddress: {
          paymentCredential: {
            VerificationKeyCredential: [minter],
          },
          stakeCredential: null,
        },
      },
      handle.SettingsV1Documentation._datum,
    );
    let settings_datum = Data.to(
      {
        mintGovernor: contracts.scripts.mint_v1.hash(),
        settingsGovernor: contracts.scripts.settings_v1.hash(),
        data: settings_v1_datum,
      },
      handle.SettingsProxySpend.datum,
    );

    let settings_value = new Core.Value(
      5_000_000n,
      new Map([[contracts.utils.settings_asset_id, 1n]]),
    );
    let tx = blaze
      .newTransaction()
      .addInput(seed)
      .lockAssets(
        contracts.utils.settings_address,
        settings_value,
        settings_datum,
      )
      .lockLovelace(
        contracts.utils.settings_address,
        2_000_000n,
        plutusVoid(),
        contracts.scripts.mint_v1,
      )
      .addRegisterStake(contracts.utils.mint_v1_credential)
      .addRegisterStake(contracts.utils.settings_v1_credential)
      .addMint(
        contracts.utils.settings_policy,
        new Map([[contracts.utils.settings_asset_name, 1n]]),
        plutusVoid(),
      )
      .provideScript(contracts.scripts.settings_proxy);
    let ctx = await tx.complete();
    await fs.writeFile("references", JSON.stringify([[ctx.getId(), 1]]));
    return ctx;
  };
