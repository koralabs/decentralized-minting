import { BlockFrostAPI } from "@blockfrost/blockfrost-js";

/**
 * Retained from the original helpers surface. The old
 * `fetchNetworkParameters` and `createAlwaysFailUplcProgram` helpers lived
 * here but were Helios-backed and only ever used by tests; they've been
 * removed as part of the helios cutover.
 */
const checkAccountRegistrationStatus = async (
  blockfrostApi: BlockFrostAPI,
  bech32StakingAddress: string,
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

export { checkAccountRegistrationStatus };

export * from "./common.js";
export * from "./contract.js";
export * from "./math.js";
