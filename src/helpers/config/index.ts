import { config, DotenvConfigOptions } from "dotenv";
import { Err, Ok, Result } from "ts-res";

import { mayFail } from "../error/index.js";

type ConfigTypeNames = "string" | "number";
type ConfigTypes = string | number;

const loadEnv = (options?: DotenvConfigOptions) => {
  mayFail(() => config(options));
};

function get(key: string, type: "string"): Result<string, string>;
function get(key: string, type: "number"): Result<number, string>;
function get(key: string, type: ConfigTypeNames): Result<ConfigTypes, string> {
  const v = process.env[key];
  if (v === undefined) return Err(`${key} is not set.`);
  if (type === "string") return Ok(v);
  if (!Number.isNaN(Number(v))) return Ok(Number(v));
  return Err(`${key} in env is not ${type} type.`);
}

function has(key: string): boolean {
  const v = process.env[key];
  return v !== undefined;
}

export { get, has, loadEnv };
