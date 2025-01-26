import { NetworkParams } from "@helios-lang/ledger";
import { NetworkName } from "@helios-lang/tx-utils";
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

export { fetchNetworkParameters };
