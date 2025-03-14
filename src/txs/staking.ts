import { bytesToHex } from "@helios-lang/codec-utils";
import {
  Address,
  makeRegistrationDCert,
  parseStakingAddress,
  TxInput,
} from "@helios-lang/ledger";
import { makeTxBuilder, NetworkName } from "@helios-lang/tx-utils";

const registerStakingAddress = async (
  network: NetworkName,
  changeAddress: Address,
  spareUtxos: TxInput[],
  bech32StakingAddress: string
) => {
  const txBuilder = makeTxBuilder({ isMainnet: network == "mainnet" });

  txBuilder.addDCert(
    makeRegistrationDCert(
      parseStakingAddress(bech32StakingAddress).stakingCredential
    )
  );
  const tx = await txBuilder.build({
    changeAddress,
    spareUtxos,
  });
  return bytesToHex(tx.toCbor());
};

export { registerStakingAddress };
