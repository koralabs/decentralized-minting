import { Blaze, Blockfrost, Data, Wallet } from "@blaze-cardano/sdk";
import { build_contracts } from "./contracts";
import * as handle from "./types/handle-mint";
import { plutusVoid } from "./utils";

export function request_handle(seed: string, handle_name: string) {
  return async (blaze: Blaze<Blockfrost, Wallet>) => {
    let seed_parts = seed.split("#");
    let transaction_id = seed_parts[0];
    let output = BigInt(seed_parts[1]);
    let contracts = build_contracts(transaction_id, output);

    let changeAddress = await blaze.wallet.getChangeAddress();
    let datum = Data.to(
      {
        destination: {
          address: {
            paymentCredential: {
              VerificationKeyCredential: [
                changeAddress.asBase()?.getPaymentCredential().hash!,
              ],
            },
            stakeCredential: {
              Inline: [
                {
                  VerificationKeyCredential: [
                    changeAddress.asBase()?.getStakeCredential().hash!,
                  ],
                },
              ],
            },
          },
          datum: "NoDatum",
        },
        owner: plutusVoid(), // TODO
        requestedHandle: Buffer.from(handle_name).toString("hex"),
      },
      handle.OrderSpend.datum,
    );

    const tx = blaze
      .newTransaction()
      .lockLovelace(contracts.utils.order_address, 5_000_000n, datum);
    return await tx.complete();
  };
}
