import { makeDummyAddress } from "@helios-lang/ledger";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildSettingsV1Data } from "../src/contracts/data/settings-v1.js";
import {
  convertHandlePriceDataToHandlePrices,
  convertHandlePricesToHandlePriceData,
} from "../src/contracts/types/handle_price.js";
import {
  parseMPTProofJSON,
  parseMPTProofStepJSON,
} from "../src/contracts/types/mpt.js";
import { invariant } from "../src/helpers/common/invariant.js";
import { get, has, loadEnv } from "../src/helpers/config/index.js";
import convertError from "../src/helpers/error/convert.js";
import { mayFail } from "../src/helpers/error/handleable.js";
import { mayFailAsync } from "../src/helpers/error/handleableAsync.js";
import {
  calculateHandlePriceFromHandlePriceInfo,
  calculateHandlePriceFromHandlePrices,
  calculateSubHandlePriceFromTierPricing,
  parseHandle,
} from "../src/utils/common.js";
import { maxBigInt, minBigInt } from "../src/utils/math.js";

const originalEnv = { ...process.env };

describe("helpers and utils", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("converts errors and wraps sync failures", () => {
    expect(convertError(undefined)).toBe("undefined");
    expect(convertError("message")).toBe("message");
    expect(convertError(new Error("boom"))).toBe("boom");
    expect(convertError({ a: 1 })).toContain('"a":1');

    const ok = mayFail(() => 42).handle(() => {
      throw new Error("should not be called");
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data).toBe(42);

    let handledError = "";
    const failed = mayFail(() => {
      throw new Error("sync-fail");
    }).handle((err) => {
      handledError = err;
    });
    expect(failed.ok).toBe(false);
    expect(handledError).toBe("sync-fail");
  });

  it("wraps async failures and successes", async () => {
    const ok = await mayFailAsync(async () => "ok").complete();
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data).toBe("ok");

    let handled = "";
    const failed = await mayFailAsync(async () => {
      throw new Error("async-fail");
    })
      .handle((err) => {
        handled = err;
      })
      .complete();
    expect(failed.ok).toBe(false);
    expect(handled).toBe("async-fail");
  });

  it("supports invariant variants", () => {
    invariant(true, "no-op");
    expect(() => invariant(false)).toThrow("Invariant failed");
    expect(() => invariant(false, "detail")).toThrow(
      "Invariant failed: detail"
    );
    expect(() => invariant(false, () => "from-fn")).toThrow(
      "Invariant failed: from-fn"
    );
  });

  it("loads env and reads typed env values", () => {
    loadEnv({ path: ".env.does-not-exist" });

    process.env.TEST_STRING = "hello";
    process.env.TEST_NUMBER = "123";
    process.env.TEST_NOT_NUMBER = "abc";

    const stringResult = get("TEST_STRING", "string");
    expect(stringResult.ok).toBe(true);
    if (stringResult.ok) expect(stringResult.data).toBe("hello");

    const numberResult = get("TEST_NUMBER", "number");
    expect(numberResult.ok).toBe(true);
    if (numberResult.ok) expect(numberResult.data).toBe(123);

    const missingResult = get("DOES_NOT_EXIST", "string");
    expect(missingResult.ok).toBe(false);
    if (!missingResult.ok) expect(missingResult.error).toContain("is not set");

    const invalidNumber = get("TEST_NOT_NUMBER", "number");
    expect(invalidNumber.ok).toBe(false);
    if (!invalidNumber.ok)
      expect(invalidNumber.error).toContain("is not number type");

    expect(has("TEST_STRING")).toBe(true);
    expect(has("DOES_NOT_EXIST")).toBe(false);
  });

  it("covers handle price helpers and parsing helpers", () => {
    const handlePriceInfo = {
      current_data: [1000n, 500n, 100n, 10n],
      prev_data: [0n, 0n, 0n, 0n],
      updated_at: 0n,
    };
    const handlePrices = {
      basic: 10,
      common: 20,
      rare: 30,
      ultraRare: 40,
    };

    expect(() =>
      calculateHandlePriceFromHandlePriceInfo("a", handlePriceInfo)
    ).toThrow("at least 2");
    expect(calculateHandlePriceFromHandlePriceInfo("ab", handlePriceInfo)).toBe(
      1000n
    );
    expect(
      calculateHandlePriceFromHandlePriceInfo("abc", handlePriceInfo)
    ).toBe(500n);
    expect(
      calculateHandlePriceFromHandlePriceInfo("abcdef", handlePriceInfo)
    ).toBe(100n);
    expect(
      calculateHandlePriceFromHandlePriceInfo(
        "abcdefghijklmnop",
        handlePriceInfo
      )
    ).toBe(10n);

    expect(() => calculateHandlePriceFromHandlePrices("a", handlePrices)).toThrow(
      "at least 2"
    );
    expect(calculateHandlePriceFromHandlePrices("ab", handlePrices)).toBe(40);
    expect(calculateHandlePriceFromHandlePrices("abc", handlePrices)).toBe(30);
    expect(calculateHandlePriceFromHandlePrices("abcdef", handlePrices)).toBe(20);
    expect(calculateHandlePriceFromHandlePrices("abcdefghijklmnop", handlePrices)).toBe(
      10
    );

    expect(
      calculateSubHandlePriceFromTierPricing("abcd", [
        [3n, 5n],
        [5n, 8n],
      ])
    ).toBe(5n);
    expect(
      calculateSubHandlePriceFromTierPricing("abcdef", [
        [3n, 5n],
        [5n, 8n],
      ])
    ).toBe(8n);

    expect(parseHandle("sub@root")).toEqual({
      isSubHandle: true,
      rootHandle: "root",
      subHandle: "sub",
    });
    expect(parseHandle("root")).toEqual({
      isSubHandle: false,
      rootHandle: "",
      subHandle: "",
    });
  });

  it("covers bigint helpers", () => {
    expect(minBigInt(5n, 3n, 10n)).toBe(3n);
    expect(maxBigInt(5n, 3n, 10n)).toBe(10n);
    expect(() => minBigInt()).toThrow("At least one value");
    expect(() => maxBigInt()).toThrow("At least one value");
  });

  it("covers handle price type conversions", () => {
    const converted = convertHandlePricesToHandlePriceData({
      basic: 1,
      common: 2,
      rare: 3,
      ultraRare: 4,
    });
    expect(converted).toEqual([4_000_000n, 3_000_000n, 2_000_000n, 1_000_000n]);

    // Keep current behavior mapping as-is.
    expect(convertHandlePriceDataToHandlePrices([4_000_000n, 3_000_000n, 2_000_000n, 1_000_000n])).toEqual({
      basic: 4,
      common: 3,
      rare: 2,
      ultraRare: 1,
    });
  });

  it("parses MPT proof JSON and validates error branches", () => {
    const proof = parseMPTProofJSON([
      { type: "branch", skip: 1, neighbors: "aa" },
      { type: "fork", skip: 2, neighbor: { nibble: 1, prefix: "bb", root: "cc" } },
      { type: "leaf", skip: 3, neighbor: { key: "dd", value: "ee" } },
    ]);
    expect(proof).toHaveLength(3);

    expect(() => parseMPTProofJSON({} as unknown as object)).toThrow("not an array");
    expect(() => parseMPTProofStepJSON({ type: "branch" } as unknown as object)).toThrow(
      "skip field is missing"
    );
    expect(() => parseMPTProofStepJSON({ skip: 1 } as unknown as object)).toThrow(
      "type field is missing"
    );
    expect(() =>
      parseMPTProofStepJSON({ type: "branch", skip: 1 } as unknown as object)
    ).toThrow("neighbors field is missing");
    expect(() =>
      parseMPTProofStepJSON({ type: "fork", skip: 1 } as unknown as object)
    ).toThrow("neighbor field is missing");
    expect(() =>
      parseMPTProofStepJSON({ type: "leaf", skip: 1 } as unknown as object)
    ).toThrow("neighbor field is missing");
    expect(() =>
      parseMPTProofStepJSON({ type: "unknown", skip: 1 } as unknown as object)
    ).toThrow("type is invalid");
  });

  it("fetches network params, account registration status, and always-fail uplc program", async () => {
    const previousFetch = global.fetch;
    global.fetch = vi
      .fn()
      .mockResolvedValue({ json: async () => ({ txFeeFixed: 1 }) }) as unknown as typeof fetch;

    const { checkAccountRegistrationStatus, createAlwaysFailUplcProgram, fetchNetworkParameters } =
      await import("../src/utils/index.js");

    const paramsResult = await fetchNetworkParameters("preprod");
    expect(paramsResult.ok).toBe(true);

    const blockfrostApi = {
      accountsRegistrations: vi.fn().mockResolvedValue([{ action: "registered" }]),
    };
    expect(
      await checkAccountRegistrationStatus(blockfrostApi as never, "stake_test")
    ).toBe("registered");

    blockfrostApi.accountsRegistrations.mockRejectedValue(new Error("missing"));
    expect(
      await checkAccountRegistrationStatus(blockfrostApi as never, "stake_test")
    ).toBe("none");

    const uplc = createAlwaysFailUplcProgram();
    expect(typeof uplc.toCbor).toBe("function");

    global.fetch = previousFetch;
  });

  it("covers API helper request header composition", async () => {
    vi.resetModules();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });

    vi.doMock("cross-fetch", () => ({ fetch: fetchMock }));
    vi.doMock("../src/constants/index.js", async () => {
      const actual = await vi.importActual<typeof import("../src/constants/index.js")>(
        "../src/constants/index.js"
      );
      return {
        ...actual,
        HANDLE_API_ENDPOINT: "https://api.example.test",
        HANDLE_ME_API_KEY: "api-key",
        KORA_USER_AGENT: "kora-agent",
      };
    });

    const { fetchApi } = await import("../src/helpers/api.js");
    await fetchApi("handles", {
      method: "GET",
      headers: { Accept: "text/plain" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/handles", {
      method: "GET",
      headers: {
        Accept: "text/plain",
        "User-Agent": "kora-agent",
        "api-key": "api-key",
      },
    });
  });

  it("covers blockfrost network/client helpers", async () => {
    const { getNetwork: getNetworkReal } = await import(
      "../src/helpers/blockfrost/network.js"
    );
    expect(() => getNetworkReal("invalid-key")).toThrow("Unknown network");

    vi.resetModules();
    const makeBlockfrostV0Client = vi.fn().mockReturnValue({ mocked: true });
    const getNetwork = vi.fn().mockReturnValue("preview");
    vi.doMock("@helios-lang/tx-utils", () => ({
      makeBlockfrostV0Client,
    }));
    vi.doMock("../src/helpers/blockfrost/network.js", () => ({
      getNetwork,
    }));

    const { getBlockfrostV0Client } = await import("../src/helpers/blockfrost/client.js");
    const client = getBlockfrostV0Client("preview_testkey");
    expect(getNetwork).toHaveBeenCalledWith("preview_testkey");
    expect(makeBlockfrostV0Client).toHaveBeenCalledWith(
      "preview",
      "preview_testkey"
    );
    expect(client).toEqual({ mocked: true });
  });

  it("builds and decodes settings-v1 data round-trip", async () => {
    const sampleAddress = makeDummyAddress(false);
    const settings = {
      policy_id: "ab".repeat(28),
      allowed_minters: ["cd".repeat(28)],
      valid_handle_price_assets: ["ef".repeat(28) + "." + "01"],
      treasury_address: sampleAddress,
      treasury_fee_percentage: 10n,
      pz_script_address: sampleAddress,
      order_script_hash: "ff".repeat(28),
      minting_data_script_hash: "11".repeat(28),
    };
    const built = buildSettingsV1Data(settings);
    const { decodeSettingsV1Data } = await import(
      "../src/contracts/data/settings-v1.js"
    );
    const decoded = decodeSettingsV1Data(built, "preview");
    expect(decoded.policy_id).toBe(settings.policy_id);
    expect(decoded.allowed_minters).toEqual(settings.allowed_minters);
  });
});
