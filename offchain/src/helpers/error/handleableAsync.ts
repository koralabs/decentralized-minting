import { Err, Ok, Result } from "ts-res";

import convertError from "./convert.js";

type Callback<T> = () => Promise<T>;
type ErrType = string | Error | void | undefined;
type HandleableResult<T, E extends ErrType> = {
  handle: (handler: (e: E) => void) => HandleableResult<T, E>;
  complete: () => Promise<Result<T, E>>;
};

const mayFailAsync = <T>(
  callback: Callback<T>
): HandleableResult<T, string> => {
  const createHandleable = (
    handler: (e: string) => void
  ): HandleableResult<T, string> => {
    return {
      handle: (handler) => createHandleable(handler),
      complete: async (): Promise<Result<T, string>> => {
        try {
          return Ok(await callback());
        } catch (err) {
          const errMsg = convertError(err);
          handler(errMsg);
          return Err(errMsg);
        }
      },
    };
  };

  return createHandleable(() => {});
};

export { mayFailAsync };
