import { describe, expect, it, vi } from "vitest";

const setupModule = async () => {
  vi.resetModules();

  const fetchApi = vi.fn();
  const decodeSettingsDatum = vi.fn();
  const decodeSettingsV1Data = vi.fn();
  const decodeMintingDataDatum = vi.fn();
  const decodeHandlePriceInfoDatum = vi.fn();
  const blockfrostFetch = vi.fn();

  const makeTxOutput = vi.fn(
    (address: unknown, value: unknown, datum: unknown) => ({
      address,
      value,
      datum,
    })
  );
  const makeTxInput = vi.fn((utxo: unknown, output: unknown) => ({
    utxo,
    ...(output as object),
  }));

  vi.doMock("@helios-lang/ledger", () => ({
    makeAddress: vi.fn((address: string) => ({ bech32: address })),
    makeAssetClass: vi.fn((assetClass: string) => assetClass),
    makeAssets: vi.fn((assets: unknown) => assets),
    makeInlineTxOutputDatum: vi.fn((datum: unknown) => ({ kind: "InlineTxOutputDatum", data: datum })),
    makeTxInput,
    makeTxOutput,
    makeValue: vi.fn((lovelace: bigint, assets: unknown) => ({ lovelace, assets })),
  }));
  vi.doMock("@helios-lang/uplc", () => ({
    decodeUplcData: vi.fn((datum: string) => `decoded:${datum}`),
  }));
  vi.doMock("../src/constants/index.js", async () => {
    const actual = await vi.importActual<typeof import("../src/constants/index.js")>(
      "../src/constants/index.js"
    );
    return {
      ...actual,
      LEGACY_POLICY_ID: "policy-id",
      MINTING_DATA_HANDLE_NAME: "minting-data",
      SETTINGS_HANDLE_NAME: "settings",
    };
  });
  vi.doMock("../src/contracts/index.js", () => ({
    decodeSettingsDatum,
    decodeSettingsV1Data,
    decodeMintingDataDatum,
    decodeHandlePriceInfoDatum,
  }));
  vi.doMock("../src/helpers/index.js", () => ({
    fetchApi,
    getNetwork: vi.fn(() => "preview"),
    mayFail: <T>(callback: () => T) => {
      try {
        return { ok: true as const, data: callback() };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  }));
  vi.doMock("cross-fetch", () => ({
    fetch: blockfrostFetch,
  }));

  const module = await import("../src/configs/index.js");
  return {
    module,
    fetchApi,
    decodeSettingsDatum,
    decodeSettingsV1Data,
    decodeMintingDataDatum,
    decodeHandlePriceInfoDatum,
    blockfrostFetch,
    makeTxOutput,
    makeTxInput,
  };
};

describe("configs fetchers", () => {
  it("fetches settings successfully", async () => {
    const {
      module,
      fetchApi,
      decodeSettingsDatum,
      decodeSettingsV1Data,
      makeTxInput,
      makeTxOutput,
    } = await setupModule();

    fetchApi
      .mockResolvedValueOnce({
        json: async () => ({
          utxo: "settings-utxo",
          resolved_addresses: { ada: "addr_test1q..." },
          hex: "abcd",
        }),
      })
      .mockResolvedValueOnce({
        text: async () => "settings-datum-cbor",
      });
    decodeSettingsDatum.mockReturnValue({ data: "settings-v1-data" });
    decodeSettingsV1Data.mockReturnValue({ allowed_minters: ["minter"] });

    const result = await module.fetchSettings("preview");
    expect(result.ok).toBe(true);
    expect(fetchApi).toHaveBeenCalledTimes(2);
    expect(decodeSettingsDatum).toHaveBeenCalledTimes(1);
    expect(decodeSettingsV1Data).toHaveBeenCalledWith("settings-v1-data", "preview");
    expect(makeTxOutput).toHaveBeenCalledTimes(1);
    expect(makeTxInput).toHaveBeenCalledTimes(1);
  });

  it("fails settings fetch when datum is missing", async () => {
    const { module, fetchApi } = await setupModule();
    fetchApi
      .mockResolvedValueOnce({
        json: async () => ({
          utxo: "settings-utxo",
          resolved_addresses: { ada: "addr_test1q..." },
          hex: "abcd",
        }),
      })
      .mockResolvedValueOnce({
        text: async () => "",
      });

    await expect(module.fetchSettings("preview")).rejects.toThrow(
      "Settings Datum Not Found"
    );
  });

  it("returns Err when settings decode fails", async () => {
    const { module, fetchApi, decodeSettingsDatum } = await setupModule();
    fetchApi
      .mockResolvedValueOnce({
        json: async () => ({
          utxo: "settings-utxo",
          resolved_addresses: { ada: "addr_test1q..." },
          hex: "abcd",
        }),
      })
      .mockResolvedValueOnce({
        text: async () => "settings-datum-cbor",
      });
    decodeSettingsDatum.mockImplementation(() => {
      throw new Error("bad-settings");
    });

    const result = await module.fetchSettings("preview");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("bad-settings");
  });

  it("returns Err when settings-v1 decode fails", async () => {
    const { module, fetchApi, decodeSettingsDatum, decodeSettingsV1Data } =
      await setupModule();
    fetchApi
      .mockResolvedValueOnce({
        json: async () => ({
          utxo: "settings-utxo",
          resolved_addresses: { ada: "addr_test1q..." },
          hex: "abcd",
        }),
      })
      .mockResolvedValueOnce({
        text: async () => "settings-datum-cbor",
      });
    decodeSettingsDatum.mockReturnValue({ data: "settings-v1-data" });
    decodeSettingsV1Data.mockImplementation(() => {
      throw new Error("bad-settings-v1");
    });

    const result = await module.fetchSettings("preview");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("bad-settings-v1");
  });

  it("fetches minting data successfully", async () => {
    const { module, fetchApi, decodeMintingDataDatum, blockfrostFetch } = await setupModule();
    fetchApi
      .mockResolvedValueOnce({
        json: async () => ({
          utxo: "minting-data-utxo-ref",
          resolved_addresses: { ada: "addr_test1q..." },
          hex: "dcba",
        }),
      })
      .mockResolvedValueOnce({
        text: async () => "minting-datum-cbor",
      });
    blockfrostFetch
      .mockResolvedValueOnce({
        json: async () => [{ tx_hash: "live-tx-id" }],
      })
      .mockResolvedValueOnce({
        json: async () => ({
          outputs: [
            {
              output_index: 7,
              amount: [
                { unit: "lovelace", quantity: "3000000" },
                { unit: "policy-iddcba", quantity: "1" },
              ],
            },
          ],
        }),
      });
    decodeMintingDataDatum.mockReturnValue({ mpt_root_hash: "aa".repeat(32) });

    const result = await module.fetchMintingData();
    expect(result.ok).toBe(true);
    expect(fetchApi).toHaveBeenCalledTimes(2);
    expect(blockfrostFetch).toHaveBeenCalledTimes(2);
  });

  it("uses the current minting data /utxo reference for the tx input", async () => {
    const { module, fetchApi, blockfrostFetch } = await setupModule();
    fetchApi
      .mockResolvedValueOnce({
        json: async () => ({
          utxo: "stale-utxo-ref",
          resolved_addresses: { ada: "addr_test1q..." },
          hex: "dcba",
        }),
      })
      .mockResolvedValueOnce({
        text: async () => "minting-datum-cbor",
      });
    blockfrostFetch
      .mockResolvedValueOnce({
        json: async () => [{ tx_hash: "live-tx-id" }],
      })
      .mockResolvedValueOnce({
        json: async () => ({
          outputs: [
            {
              output_index: 7,
              amount: [
                { unit: "lovelace", quantity: "3000000" },
                { unit: "policy-iddcba", quantity: "1" },
              ],
            },
          ],
        }),
      });

    const result = await module.fetchMintingData();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.mintingDataAssetTxInput.utxo).toBe("live-tx-id#7");
  });

  it("fails minting data fetch when datum is missing", async () => {
    const { module, fetchApi } = await setupModule();
    fetchApi
      .mockResolvedValueOnce({
        json: async () => ({
          utxo: "minting-data-utxo-ref",
          resolved_addresses: { ada: "addr_test1q..." },
          hex: "dcba",
        }),
      })
      .mockResolvedValueOnce({
        text: async () => "",
      });

    await expect(module.fetchMintingData()).rejects.toThrow(
      "Minting Data Datum Not Found"
    );
  });

  it("returns Err when minting data decode fails", async () => {
    const { module, fetchApi, decodeMintingDataDatum, blockfrostFetch } = await setupModule();
    fetchApi
      .mockResolvedValueOnce({
        json: async () => ({
          utxo: "minting-data-utxo-ref",
          resolved_addresses: { ada: "addr_test1q..." },
          hex: "dcba",
        }),
      })
      .mockResolvedValueOnce({
        text: async () => "minting-datum-cbor",
      });
    blockfrostFetch
      .mockResolvedValueOnce({
        json: async () => [{ tx_hash: "live-tx-id" }],
      })
      .mockResolvedValueOnce({
        json: async () => ({
          outputs: [
            {
              output_index: 7,
              amount: [
                { unit: "lovelace", quantity: "3000000" },
                { unit: "policy-iddcba", quantity: "1" },
              ],
            },
          ],
        }),
      });
    decodeMintingDataDatum.mockImplementation(() => {
      throw new Error("bad-minting-data");
    });

    const result = await module.fetchMintingData();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("bad-minting-data");
  });

  it("fetches handle price info successfully", async () => {
    const { module, fetchApi, decodeHandlePriceInfoDatum } = await setupModule();
    fetchApi
      .mockResolvedValueOnce({
        json: async () => ({
          utxo: "price-utxo-ref",
          resolved_addresses: { ada: "addr_test1q..." },
          hex: "9988",
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ lovelace: "5000000" }),
      })
      .mockResolvedValueOnce({
        text: async () => "price-datum-cbor",
      });
    decodeHandlePriceInfoDatum.mockReturnValue({
      current_data: [1n, 2n, 3n, 4n],
      prev_data: [1n, 2n, 3n, 4n],
      updated_at: 1n,
    });

    const result = await module.fetchHandlePriceInfoData("price@handle_prices");
    expect(result.ok).toBe(true);
    expect(fetchApi).toHaveBeenCalledTimes(3);
  });

  it("fails handle price fetch when datum is missing", async () => {
    const { module, fetchApi } = await setupModule();
    fetchApi
      .mockResolvedValueOnce({
        json: async () => ({
          utxo: "price-utxo-ref",
          resolved_addresses: { ada: "addr_test1q..." },
          hex: "9988",
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ lovelace: "5000000" }),
      })
      .mockResolvedValueOnce({
        text: async () => "",
      });

    await expect(
      module.fetchHandlePriceInfoData("price@handle_prices")
    ).rejects.toThrow("Handle Price Info Datum Not Found");
  });

  it("returns Err when handle price decode fails", async () => {
    const { module, fetchApi, decodeHandlePriceInfoDatum } = await setupModule();
    fetchApi
      .mockResolvedValueOnce({
        json: async () => ({
          utxo: "price-utxo-ref",
          resolved_addresses: { ada: "addr_test1q..." },
          hex: "9988",
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ lovelace: "5000000" }),
      })
      .mockResolvedValueOnce({
        text: async () => "price-datum-cbor",
      });
    decodeHandlePriceInfoDatum.mockImplementation(() => {
      throw new Error("bad-handle-price");
    });

    const result = await module.fetchHandlePriceInfoData("price@handle_prices");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("bad-handle-price");
  });
});
