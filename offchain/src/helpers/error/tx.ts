import { bytesToHex } from "@helios-lang/codec-utils";
import { Address, Tx, TxInput } from "@helios-lang/ledger";
import { TxBuilder } from "@helios-lang/tx-utils";
import { makeBasicUplcLogger, UplcLogger } from "@helios-lang/uplc";
// import fs from "fs/promises";
import { Err, Ok, Result } from "ts-res";

import convertError from "./convert.js";

class BuildTxError extends Error {
  code: number;
  failedTxCbor: string;
  failedTxJson: object;

  static fromError(error: Error, failedTx: Tx) {
    const err = new BuildTxError(
      error.message,
      bytesToHex(failedTx.toCbor()),
      failedTx.dump()
    );
    err.stack = error.stack;
    err.cause = error.cause;
    return err;
  }

  constructor(message: string, failedTxCbor: string, failedTxJson: object) {
    super(message);
    this.name = "BuildTxError";
    this.code = 500;
    this.failedTxCbor = failedTxCbor;
    this.failedTxJson = failedTxJson;
  }
}

/**
 * SuccessResult - attached to handles listed on marketplace
 * @interface
 * @typedef {object} SuccessResult
 * @property {string} cbor CBOR Hex of transaction, you can sign and submit
 * @property {any} dump Transaction's Dump
 */
interface TxSuccessResult {
  tx: Tx;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dump: any;
}

type ErrType = string | Error | BuildTxError | void | undefined;
type HandleableResult<E extends ErrType> = {
  handle: (handler: (e: E) => void) => HandleableResult<E>;
  complete: () => Promise<Result<TxSuccessResult, E>>;
};

const halfArray = <T>(array: T[]): T[] =>
  array.slice(0, Math.floor(array.length / 2));

const mayFailTransaction = (
  txBuilder: TxBuilder,
  changeAddress: Address,
  spareUtxos: TxInput[]
): HandleableResult<Error | BuildTxError> => {
  const createHandleable = (
    handler: (e: Error) => void
  ): HandleableResult<Error | BuildTxError> => {
    return {
      handle: (handler) => createHandleable(handler),
      complete: async (): Promise<
        Result<TxSuccessResult, Error | BuildTxError>
      > => {
        const logs: string[] = [];
        const logger: UplcLogger = {
          ...makeBasicUplcLogger(),
          logPrint: (msg: string) => logs.push(msg),
        };
        if (logger.reset) logger.reset("build");
        try {
          const tx = await txBuilder.buildUnsafe({
            changeAddress,
            spareUtxos,
            logOptions: logger,
            throwBuildPhaseScriptErrors: false,
          });
          if (tx.hasValidationError) {
            // await fs.writeFile("error.json", JSON.stringify(tx.dump()));
            const txValidationError = BuildTxError.fromError(
              new Error(
                convertError(tx.hasValidationError) +
                  "\nValidation logs:" +
                  halfArray(logs).map((log) => "\nLog: " + log)
              ),
              tx
            );
            handler(txValidationError);
            return Err(txValidationError);
          }
          return Ok({ tx, dump: tx.dump() });
        } catch (buildError) {
          const txError = new Error(
            `Tx Build Error: ${convertError(buildError)}`
          );
          handler(txError);
          return Err(txError);
        }
      },
    };
  };

  return createHandleable(() => {});
};

export { BuildTxError, mayFailTransaction };
export type { TxSuccessResult };
