import { Address, TxInput } from "@helios-lang/ledger";

/**
 * @interface
 * @typedef WalletWithoutKey
 * @property {Address} address Address to perform Publish
 * @property {TxInput[]} utxos UTxOs of address
 * @property {TxInput | undefined} collateralUtxo Collateral UTxO
 */
interface WalletWithoutKey {
  address: Address;
  utxos: TxInput[];
  collateralUtxo?: TxInput;
}

export type { WalletWithoutKey };
