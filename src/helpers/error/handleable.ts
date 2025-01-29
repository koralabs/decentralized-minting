import { Err, Ok, Result } from "ts-res";

import convertError from "./convert.js";

type Callback<T> = () => T;
type ErrType = string | Error | void | undefined;
type HandleableResult<T, E extends ErrType> = Result<T, E> & {
  handle: (handler: (error: E) => void) => Result<T, E>;
};

const toHandleable = <T, E extends ErrType>(
  result: Result<T, E>
): HandleableResult<T, E> => {
  return {
    ...result,
    handle: (handler: (error: E) => void) => {
      if (!result.ok) handler(result.error);
      return result;
    },
  };
};

const mayFail = <T>(callback: Callback<T>): HandleableResult<T, string> => {
  try {
    return toHandleable(Ok(callback()));
  } catch (error) {
    return toHandleable(Err(convertError(error)));
  }
};

export { mayFail };
