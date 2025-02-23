import { BlockFrostAPI } from "@blockfrost/blockfrost-js";
import { NetworkParams } from "@helios-lang/ledger";
import { NetworkName } from "@helios-lang/tx-utils";
import { decodeUplcProgramV2FromCbor, UplcProgramV2 } from "@helios-lang/uplc";
import { Result } from "ts-res";

import { mayFailAsync } from "../helpers/index.js";

const NETWORK_PARAMETER_URL = (network: NetworkName) =>
  `https://network-status.helios-lang.io/${network}/config`;

const fetchNetworkParameters = async (
  network: NetworkName
): Promise<Result<NetworkParams, string>> => {
  return await mayFailAsync(
    async () =>
      (
        await fetch(NETWORK_PARAMETER_URL(network))
      ).json() as unknown as NetworkParams
  ).complete();
};

const checkAccountRegistrationStatus = async (
  blockfrostApi: BlockFrostAPI,
  bech32StakingAddress: string
): Promise<"registered" | "deregistered" | "none"> => {
  try {
    const data = (
      await blockfrostApi.accountsRegistrations(bech32StakingAddress, {
        order: "desc",
      })
    )[0];
    return data.action;
  } catch {
    return "none";
  }
};

const createAlwaysFailUplcProgram = (): UplcProgramV2 => {
  const header = "58250100003222253330043330043371e91103";
  const randomString = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  const middle = "00488103";
  const footer = "004a0944526136565735";
  const compiledCode = `${header}${randomString}${middle}${randomString}${footer}`;
  const program = decodeUplcProgramV2FromCbor(compiledCode);

  return program;
};

export {
  checkAccountRegistrationStatus,
  createAlwaysFailUplcProgram,
  fetchNetworkParameters,
};
