import { afterEach, describe, expect, it, vi } from "vitest";

// fetchApi's only boundary is cross-fetch; stub it so script-discovery tests
// control exactly what api.handle.me returns.
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("cross-fetch", () => ({ fetch: fetchMock }));

import { Cardano } from "@cardano-sdk/core";

import {
  buildOrderCancelRedeemer,
  buildOrderData,
  buildOrderExecuteRedeemer,
  buildOrderRefundRedeemer,
  decodeOrderDatum,
} from "../src/contracts/data/order.js";
import {
  mkBytes,
  mkConstr,
  mkInt,
  plutusDataToCbor,
} from "../src/contracts/data/plutusData.js";
import {
  convertHandlePriceDataToHandlePrices,
  convertHandlePricesToHandlePriceData,
} from "../src/contracts/types/handle_price.js";
import convertError from "../src/helpers/error/convert.js";
import { mayFail } from "../src/helpers/error/handleable.js";
import { mayFailAsync } from "../src/helpers/error/handleableAsync.js";
import { BuildTxError } from "../src/helpers/error/tx.js";
import {
  calculateHandlePriceFromHandlePriceInfo,
  calculateHandlePriceFromHandlePrices,
  calculateSubHandlePriceFromTierPricing,
  parseHandle,
} from "../src/utils/common.js";
import {
  fetchDeployedScript,
  fetchDeployedScriptByHash,
} from "../src/utils/contract.js";
import { maxBigInt, minBigInt } from "../src/utils/math.js";

const respondWith = (body: unknown) =>
  fetchMock.mockResolvedValueOnce({ json: async () => body });

afterEach(() => {
  fetchMock.mockReset();
});

describe("handle pricing by length", () => {
  // [ultraRare, rare, common, basic] in lovelace
  const info = {
    current_data: [500_000_000n, 100_000_000n, 50_000_000n, 10_000_000n],
    prev_data: [1n, 1n, 1n, 1n],
    updated_at: 0n,
  };
  const prices = { ultraRare: 500, rare: 100, common: 50, basic: 10 };

  it("prices each length tier from the on-chain price info (2 / 3 / 4-7 / 8-15 / 16+)", () => {
    expect(
      ["ab", "abc", "abcd", "abcdefg", "abcdefgh", "a".repeat(15), "a".repeat(28)].map(
        (h) => calculateHandlePriceFromHandlePriceInfo(h, info),
      ),
    ).toEqual([
      500_000_000n,
      100_000_000n,
      50_000_000n,
      50_000_000n,
      10_000_000n,
      10_000_000n,
      10_000_000n,
    ]);
  });

  it("prices each length tier from human-readable ADA prices", () => {
    expect(
      ["ab", "abc", "abcdefg", "abcdefgh", "a".repeat(20)].map((h) =>
        calculateHandlePriceFromHandlePrices(h, prices),
      ),
    ).toEqual([500, 100, 50, 10, 10]);
  });

  it("refuses to price a handle shorter than 2 characters", () => {
    expect(() => calculateHandlePriceFromHandlePriceInfo("a", info)).toThrow(
      "Handle must be at least 2 characters",
    );
    expect(() => calculateHandlePriceFromHandlePrices("", prices)).toThrow(
      "Handle must be at least 2 characters",
    );
  });

  it("converts ADA prices to lovelace price data and back without swapping tiers", () => {
    const data = convertHandlePricesToHandlePriceData(prices);
    expect(data).toEqual([500_000_000n, 100_000_000n, 50_000_000n, 10_000_000n]);
    expect(convertHandlePriceDataToHandlePrices(data)).toEqual(prices);
  });
});

describe("sub handle tier pricing", () => {
  // [min length, price]
  const tiers = [
    [1n, 50n],
    [3n, 20n],
    [6n, 5n],
  ];

  it("uses the price of the highest tier whose minimum length the sub handle reaches", () => {
    expect(calculateSubHandlePriceFromTierPricing("ab", tiers)).toBe(50n);
    expect(calculateSubHandlePriceFromTierPricing("abc", tiers)).toBe(20n);
    expect(calculateSubHandlePriceFromTierPricing("abcdefghij", tiers)).toBe(5n);
  });

  it("is free below the first tier and with no tiers", () => {
    expect(calculateSubHandlePriceFromTierPricing("abcd", [[5n, 9n]])).toBe(0n);
    expect(calculateSubHandlePriceFromTierPricing("abcd", [])).toBe(0n);
  });
});

describe("parseHandle", () => {
  it("splits a sub handle at the first @", () => {
    expect(parseHandle("sub@root")).toEqual({
      isSubHandle: true,
      rootHandle: "root",
      subHandle: "sub",
    });
  });

  it("reports a root handle as not a sub handle", () => {
    expect(parseHandle("root")).toEqual({
      isSubHandle: false,
      rootHandle: "",
      subHandle: "",
    });
  });
});

describe("bigint min/max", () => {
  it("returns the extreme value, including negatives", () => {
    expect(minBigInt(5n, -2n, 9n)).toBe(-2n);
    expect(maxBigInt(5n, -2n, 9n)).toBe(9n);
    expect(minBigInt(7n)).toBe(7n);
  });

  it("throws with no values", () => {
    expect(() => minBigInt()).toThrow("At least one value must be provided");
    expect(() => maxBigInt()).toThrow("At least one value must be provided");
  });
});

describe("error helpers", () => {
  it("convertError renders every thrown shape as a readable string", () => {
    expect(convertError(undefined)).toBe("undefined");
    expect(convertError(new Error("boom"))).toBe("boom");
    expect(convertError("plain")).toBe("plain");
    expect(convertError(42)).toBe("42");
    expect(convertError({ code: 7 })).toContain('"code":7');
  });

  it("mayFail returns Ok for a value and Err (with the handler called) for a throw", () => {
    const ok = mayFail(() => 3);
    expect(ok.ok && ok.data).toBe(3);

    const seen: string[] = [];
    const failed = mayFail(() => {
      throw new Error("bad input");
    }).handle((e) => seen.push(e));
    expect(failed.ok).toBe(false);
    expect(!failed.ok && failed.error).toBe("bad input");
    expect(seen).toEqual(["bad input"]);

    const notCalled: string[] = [];
    mayFail(() => 1).handle((e) => notCalled.push(e));
    expect(notCalled).toEqual([]);
  });

  it("mayFailAsync calls only the last attached handler, and only on failure", async () => {
    const ok = await mayFailAsync(async () => "v").complete();
    expect(ok.ok && ok.data).toBe("v");

    const first: string[] = [];
    const last: string[] = [];
    const failed = await mayFailAsync(async () => {
      throw new Error("network down");
    })
      .handle((e) => first.push(e))
      .handle((e) => last.push(e))
      .complete();
    expect(!failed.ok && failed.error).toBe("network down");
    expect(first).toEqual([]);
    expect(last).toEqual(["network down"]);
  });

  it("BuildTxError.from keeps the original message, stack and cause with the failed tx", () => {
    const original = new Error("fee too small", { cause: "utxo" });
    const err = BuildTxError.from(original, "84a4", { fee: "1" });
    expect(err).toBeInstanceOf(BuildTxError);
    expect(err.name).toBe("BuildTxError");
    expect(err.code).toBe(500);
    expect(err.message).toBe("fee too small");
    expect(err.stack).toBe(original.stack);
    expect(err.cause).toBe("utxo");
    expect(err.failedTxCbor).toBe("84a4");
    expect(err.failedTxJson).toEqual({ fee: "1" });
    expect(BuildTxError.from(original, "").failedTxJson).toEqual({});
  });
});

describe("deployed script discovery", () => {
  it("maps legacy script types to api slugs and accepts the flat response shape", async () => {
    const flat = { scriptAddress: "addr_test1flat", validatorHash: "aa" };
    respondWith(flat);
    await expect(fetchDeployedScript("demi_mint_proxy" as never)).resolves.toEqual(flat);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/scripts\?latest=true&type=demimntprx$/,
    );
  });

  it("picks the latest entry of the exact slug from the address-keyed shape", async () => {
    respondWith({
      addr_prx: { type: "demimntprx", latest: true },
      addr_old: { type: "demimnt", latest: false, validatorHash: "01" },
      addr_new: { type: "demimnt", latest: true, validatorHash: "02" },
    });
    await expect(fetchDeployedScript("demi_mint" as never)).resolves.toEqual({
      type: "demimnt",
      latest: true,
      validatorHash: "02",
      scriptAddress: "addr_new",
    });
  });

  it("falls back to any entry of the slug when none is marked latest, and passes unknown types through", async () => {
    respondWith({ addr_only: { type: "custom", latest: false } });
    await expect(fetchDeployedScript("custom" as never)).resolves.toEqual({
      type: "custom",
      latest: false,
      scriptAddress: "addr_only",
    });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/type=custom$/);
  });

  it("fails loud when nothing is deployed", async () => {
    respondWith(null);
    await expect(fetchDeployedScript("demi_mint" as never)).rejects.toThrow(
      "demi_mint script details not deployed",
    );
    respondWith("nope");
    await expect(fetchDeployedScript("demi_mint" as never)).rejects.toThrow(
      "not deployed",
    );
    respondWith({ addr_x: { type: "demimntmpt" } });
    await expect(fetchDeployedScript("demi_mint" as never)).rejects.toThrow(
      "not deployed",
    );
  });

  it("resolves by the settings-pinned hash (case-insensitive), not by api latest", async () => {
    respondWith({
      addr_latest: { type: "demimntmpt", latest: true, validatorHash: "1111" },
      addr_pinned: { type: "demimntmpt", latest: false, validatorHash: "ABCD" },
      addr_prefix: { type: "demimntmptx", validatorHash: "abcd" },
    });
    await expect(
      fetchDeployedScriptByHash("demi_minting_data" as never, "abcd"),
    ).resolves.toMatchObject({ scriptAddress: "addr_pinned", validatorHash: "ABCD" });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/scripts\?type=demimntmpt$/);
  });

  it("accepts a flat response only when its hash is the pinned one", async () => {
    const flat = { scriptAddress: "addr_flat", validatorHash: "AbCd" };
    respondWith(flat);
    await expect(
      fetchDeployedScriptByHash("demi_mint" as never, "abcd"),
    ).resolves.toEqual(flat);

    respondWith({ scriptAddress: "addr_flat", validatorHash: "ffff" });
    await expect(
      fetchDeployedScriptByHash("demi_mint" as never, "abcd"),
    ).rejects.toThrow("does not match settings-pinned hash abcd");

    respondWith({ scriptAddress: "addr_flat" });
    await expect(
      fetchDeployedScriptByHash("demi_mint" as never, "abcd"),
    ).rejects.toThrow("does not match settings-pinned hash");
  });

  it("fails loud when the pinned hash is not deployed", async () => {
    respondWith({ addr_a: { type: "demimnt", validatorHash: "1111" } });
    await expect(
      fetchDeployedScriptByHash("demi_mint" as never, "2222"),
    ).rejects.toThrow(
      "demi_mint script with settings-pinned validatorHash 2222 not found among deployed demimnt scripts",
    );
    respondWith(null);
    await expect(
      fetchDeployedScriptByHash("demi_mint" as never, "2222"),
    ).rejects.toThrow("demi_mint script details not deployed");
  });
});

describe("order datum encoding", () => {
  const keyHash = "11".repeat(28);
  const stakeHash = "22".repeat(28);
  const scriptHash = "33".repeat(28);
  const toBech32 = (addr: { toAddress: () => { toBech32: () => string } }) =>
    addr.toAddress().toBech32();
  const baseAddress = toBech32(
    Cardano.BaseAddress.fromCredentials(
      0,
      { type: Cardano.CredentialType.KeyHash, hash: keyHash as never },
      { type: Cardano.CredentialType.KeyHash, hash: stakeHash as never },
    ),
  );
  const scriptEnterpriseAddress = toBech32(
    Cardano.EnterpriseAddress.fromCredentials(0, {
      type: Cardano.CredentialType.ScriptHash,
      hash: scriptHash as never,
    }),
  );
  const roundTrip = (order: Parameters<typeof buildOrderData>[0]) =>
    decodeOrderDatum(plutusDataToCbor(buildOrderData(order)), "preview");

  it("round-trips a base-address order with a discount claim and the virtual flag", () => {
    const claim = mkConstr(0, [mkBytes("abcd"), mkInt(5n)]);
    const decoded = roundTrip({
      owner: mkBytes(keyHash),
      requested_handle: "6d7968616e646c65",
      destination_address: baseAddress,
      discount_claim: claim,
      is_virtual: 1n,
    });
    expect(decoded.requested_handle).toBe("6d7968616e646c65");
    expect(decoded.destination_address).toBe(baseAddress);
    expect(decoded.is_virtual).toBe(1n);
    expect(plutusDataToCbor(decoded.discount_claim!)).toBe(plutusDataToCbor(claim));
    expect(plutusDataToCbor(decoded.owner)).toBe(plutusDataToCbor(mkBytes(keyHash)));
  });

  it("round-trips a script enterprise address with no claim, defaulting to a root mint", () => {
    const decoded = roundTrip({
      owner: mkBytes(keyHash),
      requested_handle: "6869",
      destination_address: scriptEnterpriseAddress,
      is_virtual: undefined as unknown as bigint,
    });
    expect(decoded.destination_address).toBe(scriptEnterpriseAddress);
    expect(decoded.discount_claim).toBeUndefined();
    expect(decoded.is_virtual).toBe(0n);
  });

  it("decodes the address for the requested network and rejects a missing or malformed datum", () => {
    const cbor = plutusDataToCbor(
      buildOrderData({
        owner: mkBytes(keyHash),
        requested_handle: "6869",
        destination_address: baseAddress,
        is_virtual: 0n,
      }),
    );
    expect(decodeOrderDatum(cbor, "mainnet").destination_address).toMatch(/^addr1/);
    expect(() => decodeOrderDatum(undefined, "preview")).toThrow(
      "OrderDatum must have inline datum CBOR",
    );
    expect(() =>
      decodeOrderDatum(plutusDataToCbor(mkConstr(0, [mkInt(1n)])), "preview"),
    ).toThrow();
  });

  it("encodes the order redeemers as Execute=0, Cancel=1, Refund=2", () => {
    expect(
      [buildOrderExecuteRedeemer(), buildOrderCancelRedeemer(), buildOrderRefundRedeemer()].map(
        (r) => plutusDataToCbor(r),
      ),
    ).toEqual([
      plutusDataToCbor(mkConstr(0, [])),
      plutusDataToCbor(mkConstr(1, [])),
      plutusDataToCbor(mkConstr(2, [])),
    ]);
  });
});
