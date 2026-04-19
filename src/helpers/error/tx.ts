/**
 * Transaction-build error container. Carries the failed CBOR + a JSON dump
 * so failures can be inspected post-hoc by consumers like
 * `minting.handle.me`'s diagnostic logger.
 *
 * The old `mayFailTransaction` wrapper around Helios's `TxBuilder.buildUnsafe`
 * is gone — with the cardano-sdk pattern each tx builder runs coin selection
 * + `createTransactionInternals` inline and throws a plain `BuildTxError` on
 * failure, so no helper was worth keeping.
 */
class BuildTxError extends Error {
  code: number;
  failedTxCbor: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  failedTxJson: Record<string, any>;

  static from(
    error: Error,
    failedTxCbor: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    failedTxJson: Record<string, any> = {},
  ) {
    const err = new BuildTxError(error.message, failedTxCbor, failedTxJson);
    err.stack = error.stack;
    err.cause = error.cause;
    return err;
  }

  constructor(
    message: string,
    failedTxCbor: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    failedTxJson: Record<string, any>,
  ) {
    super(message);
    this.name = "BuildTxError";
    this.code = 500;
    this.failedTxCbor = failedTxCbor;
    this.failedTxJson = failedTxJson;
  }
}

interface TxSuccessResult {
  cborHex: string;
  txHash: string;
}

export { BuildTxError };
export type { TxSuccessResult };
