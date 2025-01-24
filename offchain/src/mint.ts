import { Blaze, Blockfrost, Core, Data, Wallet } from "@blaze-cardano/sdk";
import { build_contracts } from "./contracts.js";
import * as handle from "./types/handle-mint.js";
import { address_to_address, plutusVoid, proof_to_proof } from "./utils.js";
import { promises as fs } from "fs";

export function mint_handle(db: any, seed: string) {
  return async (blaze: Blaze<Blockfrost, Wallet>) => {
    let references = JSON.parse((await fs.readFile("references")).toString());
    let seed_parts = seed.split("#");
    let transaction_id = seed_parts[0];
    let output = BigInt(seed_parts[1]);
    let contracts = build_contracts(transaction_id, output);

    let [mint_script_utxo] = await blaze.provider.resolveUnspentOutputs([
      new Core.TransactionInput(
        Core.TransactionId(references[0][0]),
        BigInt(references[0][1])
      ),
    ]);

    let order_utxos = await blaze.provider.getUnspentOutputs(
      contracts.utils.order_address
    );

    console.log(contracts.utils.settings_asset_id);
    let settings_utxo = await blaze.provider.getUnspentOutputByNFT(
      contracts.utils.settings_asset_id
    );
    let settings_datum = Data.from(
      settings_utxo.output().datum()?.asInlineData()!,
      handle.SettingsProxySpend.datum
    );
    let settings_v1_datum = Data.from(
      settings_datum.data,
      handle.SettingsV1Documentation._datum
    );

    let handles = [];
    let proofs: typeof handle.MintV1Withdraw.proofs = [];
    for (const order of order_utxos) {
      let order_datum = Data.from(
        order.output().datum()?.asInlineData()!,
        handle.OrderSpend.datum
      );
      let handle_name = Buffer.from(
        order_datum.requestedHandle,
        "hex"
      ).toString();
      let minted_handle_asset_name = Core.AssetName(
        order_datum.requestedHandle
      );
      let minted_handle_asset_id = Core.AssetId.fromParts(
        contracts.utils.handle_policy_id,
        minted_handle_asset_name
      );

      let lovelace = order.output().amount().coin();

      let handle_value = new Core.Value(
        lovelace - 2_000_000n,
        new Map([[minted_handle_asset_id, 1n]])
      );
      let destination_address = address_to_address(
        order_datum.destination.address
      );
      try {
        await db.insert(handle_name, "NEW");
        let proof = await db.prove(handle_name);
        proofs.push(proof_to_proof(proof.toJSON()));
        handles.push({
          utxo: order,
          destination_address,
          handle_value,
          handle_asset_name: minted_handle_asset_name,
          destination_datum: order_datum.destination.datum,
        });
      } catch (e) {
        console.warn("Handle already exists", order_datum.requestedHandle);
      }
    }

    settings_v1_datum.allHandles = db.hash.toString("hex");
    settings_datum.data = Data.to(
      settings_v1_datum,
      handle.SettingsV1Documentation._datum
    );

    let settings_value = new Core.Value(
      5_000_000n,
      new Map([[contracts.utils.settings_asset_id, 1n]])
    );

    let proofs_redeemer = Data.to(proofs, handle.MintV1Withdraw.proofs);

    let tx = blaze
      .newTransaction()
      .addReferenceInput(mint_script_utxo)
      .addRequiredSigner(
        Core.Ed25519KeyHashHex(settings_v1_datum.allowedMinters[0])
      )
      .addInput(
        settings_utxo,
        Data.to({ wrapper: plutusVoid() }, handle.SettingsProxySpend._r)
      )
      .provideScript(contracts.scripts.settings_proxy)
      .addWithdrawal(contracts.utils.settings_v1_withdraw, 0n, plutusVoid())
      .provideScript(contracts.scripts.settings_v1)
      .addWithdrawal(contracts.utils.mint_v1_withdraw, 0n, proofs_redeemer)
      // .provideScript(contracts.scripts.mint_v1) // Don't need to provide this script, because reference input'
      .provideScript(contracts.scripts.order)
      .provideScript(contracts.scripts.mint_proxy)
      .lockAssets(
        contracts.utils.settings_address,
        settings_value,
        Data.to(settings_datum, handle.SettingsProxySpend.datum)
      )
      .lockLovelace(
        address_to_address(settings_v1_datum.treasuryAddress),
        settings_v1_datum.treasuryFee * BigInt(handles.length),
        plutusVoid()
      )
      .payLovelace(
        await blaze.wallet.getChangeAddress(),
        settings_v1_datum.minterFee * BigInt(handles.length)
      );
    for (const handle of handles) {
      tx.addInput(handle.utxo, plutusVoid())
        .payAssets(handle.destination_address, handle.handle_value) // TODO: datum
        .addMint(
          Core.PolicyId(contracts.scripts.mint_proxy.hash()),
          new Map([[handle.handle_asset_name, 1n]]),
          plutusVoid()
        );
    }
    return await tx.complete();
  };
}
