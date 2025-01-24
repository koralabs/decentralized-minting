import { Address, TxInput } from "@helios-lang/ledger";
import { TxBuilder } from "@helios-lang/tx-utils";
import { makeBasicUplcLogger, UplcLogger } from "@helios-lang/uplc";
import { Err, Ok, Result } from "ts-res";

import { BuildTxError, SuccessResult } from "../../types.js";
import convertError from "./convert.js";

type ErrType = string | Error | BuildTxError | void | undefined;
type HandleableResult<E extends ErrType> = {
  handle: (handler: (e: E) => void) => HandleableResult<E>;
  complete: () => Promise<Result<SuccessResult, E>>;
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
        Result<SuccessResult, Error | BuildTxError>
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
        // catch (txError) {
        //   if (logs.length == 0) {
        //     /// when the error is not related to Tx Validation
        //     const txBuildError = new Error(
        //       `Tx Build error: ${convertError(txError)}`
        //     );
        //     handler(txBuildError);
        //     return Err(txBuildError);
        //   }
        //   try {
        //     const failedTx = await txBuilder.buildUnsafe({
        //       changeAddress,
        //       spareUtxos,
        //       throwBuildPhaseScriptErrors: false,
        //     });
        //     const txValidationError = new Error(
        //       convertError(txError) +
        //         "\nValidation logs:" +
        //         logs.map((log) => "\nLog: " + log)
        //     );
        //     handler(BuildTxError.fromError(txValidationError, failedTx));
        //     return Err(txValidationError);
        //   } catch (unexpectedError) {
        //     const txError = new Error(
        //       `Unexpected Error: ${convertError(unexpectedError)}`
        //     );
        //     handler(txError);
        //     return Err(txError);
        //   }
        // }
      },
    };
  };

  return createHandleable(() => {});
};

export { mayFailTransaction };
