import { describe, expect, it, vi } from "vitest";

const setupDeployModule = async () => {
  vi.resetModules();

  const fetchDeployedScript = vi.fn();
  const getUtxo = vi.fn();
  const buildContracts = vi.fn();

  const mintProxyProgram = {
    toCbor: () => Buffer.from("aa", "hex"),
    alt: { toCbor: () => Buffer.from("ab", "hex") },
  };
  const mintingDataProgram = {
    toCbor: () => Buffer.from("ba", "hex"),
    alt: { toCbor: () => Buffer.from("bb", "hex") },
  };
  const mintV1Program = {
    toCbor: () => Buffer.from("ca", "hex"),
    alt: { toCbor: () => Buffer.from("cb", "hex") },
  };
  const ordersProgram = {
    toCbor: () => Buffer.from("da", "hex"),
  };

  buildContracts.mockReturnValue({
    mintProxy: {
      mintProxyMintUplcProgram: mintProxyProgram,
      mintProxyPolicyHash: { toHex: () => "mint-proxy-policy-hash" },
    },
    mintingData: {
      mintingDataSpendUplcProgram: mintingDataProgram,
      mintingDataValidatorHash: { toHex: () => "minting-data-validator-hash" },
      mintingDataValidatorAddress: { toBech32: () => "addr_test1_minting_data" },
    },
    mintV1: {
      mintV1WithdrawUplcProgram: mintV1Program,
      mintV1ValidatorHash: { toHex: () => "mint-v1-validator-hash" },
      mintV1StakingAddress: { toBech32: () => "stake_test1_mint_v1" },
    },
    orders: {
      ordersSpendUplcProgram: ordersProgram,
      ordersValidatorHash: { toHex: () => "orders-validator-hash" },
      ordersValidatorAddress: { toBech32: () => "addr_test1_orders" },
    },
  });

  vi.doMock("../src/contracts/index.js", () => ({
    buildContracts,
    makeMintProxyUplcProgramParameterDatum: vi.fn(() => ({
      data: { toCbor: () => Buffer.from("10", "hex") },
    })),
    makeMintingDataUplcProgramParameterDatum: vi.fn(() => ({
      data: { toCbor: () => Buffer.from("11", "hex") },
    })),
    makeMintV1UplcProgramParameterDatum: vi.fn(() => ({
      data: { toCbor: () => Buffer.from("12", "hex") },
    })),
  }));

  vi.doMock("../src/utils/contract.js", () => ({
    fetchDeployedScript,
  }));
  vi.doMock("../src/helpers/index.js", () => ({
    convertError: (item: unknown) =>
      item instanceof Error ? `converted:${item.message}` : `converted:${String(item)}`,
    invariant: (condition: unknown, message: string) => {
      if (!condition) throw new Error(message);
    },
  }));
  vi.doMock("@helios-lang/ledger", () => ({
    makeTxOutputId: vi.fn((utxo: string) => utxo),
  }));
  vi.doMock("@helios-lang/uplc", () => ({
    decodeUplcProgramV2FromCbor: vi.fn((cbor: string) => ({ cbor })),
  }));

  const module = await import("../src/txs/deploy.js");
  return {
    module,
    fetchDeployedScript,
    getUtxo,
    buildContracts,
  };
};

const setupOrderModule = async () => {
  vi.resetModules();

  const fetchHandlePriceInfoData = vi.fn();
  const fetchDeployedScript = vi.fn();
  const calculateHandlePriceFromHandlePriceInfo = vi.fn();
  const calculateHandlePriceFromHandlePrices = vi.fn();
  const getUtxos = vi.fn();
  const makeTxBuilder = vi.fn(() => {
    const txBuilder = {
      payUnsafe: vi.fn().mockReturnThis(),
      attachUplcProgram: vi.fn().mockReturnThis(),
      spendUnsafe: vi.fn().mockReturnThis(),
      addSigners: vi.fn().mockReturnThis(),
    };
    return txBuilder;
  });
  const decodeOrderDatum = vi.fn();
  const mayFail = vi.fn((callback: () => unknown) => {
    try {
      return { ok: true as const, data: callback() };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const mayFailAsync = vi.fn((callback: () => Promise<unknown> | unknown) => ({
    complete: async () => {
      try {
        return { ok: true as const, data: await callback() };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  }));

  vi.doMock("../src/configs/index.js", () => ({
    fetchHandlePriceInfoData,
  }));
  vi.doMock("../src/constants/index.js", async () => {
    const actual = await vi.importActual<typeof import("../src/constants/index.js")>(
      "../src/constants/index.js"
    );
    return {
      ...actual,
      HANDLE_PRICE_INFO_HANDLE_NAME: "kora@handle_prices",
    };
  });
  vi.doMock("../src/contracts/index.js", () => ({
    buildOrderCancelRedeemer: vi.fn(() => ({ redeemer: "cancel" })),
    buildOrderData: vi.fn(() => ({ datum: "order" })),
    decodeOrderDatum,
    makeSignatureMultiSigScriptData: vi.fn((credential: unknown) => credential),
  }));
  vi.doMock("../src/helpers/index.js", () => ({
    getBlockfrostV0Client: vi.fn(() => ({ getUtxos })),
    mayFail,
    mayFailAsync,
  }));
  vi.doMock("../src/utils/index.js", () => ({
    calculateHandlePriceFromHandlePriceInfo,
    calculateHandlePriceFromHandlePrices,
    fetchDeployedScript,
  }));
  vi.doMock("@helios-lang/ledger", () => ({
    makeAddress: vi.fn((_isMainnet: boolean, validatorHash: string) => ({
      era: "Shelley",
      spendingCredential: { kind: "ValidatorHash", toHex: () => validatorHash },
    })),
    makeInlineTxOutputDatum: vi.fn((data: unknown) => ({ kind: "InlineTxOutputDatum", data })),
    makeValidatorHash: vi.fn((hash: string) => hash),
    makeValue: vi.fn((lovelace: bigint) => ({ lovelace })),
  }));
  vi.doMock("@helios-lang/tx-utils", () => ({
    makeTxBuilder,
  }));
  vi.doMock("@helios-lang/uplc", () => ({
    decodeUplcProgramV2FromCbor: vi.fn(() => ({
      withAlt: vi.fn().mockReturnValue("decoded-script"),
    })),
  }));

  const module = await import("../src/txs/order.js");
  return {
    module,
    fetchHandlePriceInfoData,
    fetchDeployedScript,
    calculateHandlePriceFromHandlePriceInfo,
    calculateHandlePriceFromHandlePrices,
    getUtxos,
    makeTxBuilder,
    decodeOrderDatum,
    mayFail,
    mayFailAsync,
  };
};

describe("txs/deploy", () => {
  it("covers deploy contract variants and default validation", async () => {
    const { module } = await setupDeployModule();

    const params = {
      network: "preview" as const,
      mintVersion: 0n,
      legacyPolicyId: "legacy-policy",
      adminVerificationKeyHash: "admin-vkh",
    };

    const mintProxy = await module.deploy({
      ...params,
      contractName: "demimntprx.mint",
    });
    expect(mintProxy.policyId).toBe("mint-proxy-policy-hash");

    const mintingData = await module.deploy({
      ...params,
      contractName: "demimntmpt.spend",
    });
    expect(mintingData.scriptAddress).toBe("addr_test1_minting_data");

    const mintV1 = await module.deploy({
      ...params,
      contractName: "demimnt.withdraw",
    });
    expect(mintV1.scriptStakingAddress).toBe("stake_test1_mint_v1");

    const orders = await module.deploy({
      ...params,
      contractName: "demiord.spend",
    });
    expect(orders.scriptAddress).toBe("addr_test1_orders");

    await expect(
      module.deploy({
        ...params,
        contractName: "invalid.contract",
      })
    ).rejects.toThrow("Contract name must be one of");
  });

  it("fetches all deployed scripts and handles failures", async () => {
    const { module, fetchDeployedScript } = await setupDeployModule();

    const refScript = {
      withAlt: vi.fn().mockReturnValue({ altAttached: true }),
    };
    const getUtxo = vi
      .fn()
      .mockResolvedValueOnce({ output: { refScript } })
      .mockResolvedValueOnce({ output: { refScript } })
      .mockResolvedValueOnce({ output: { refScript } })
      .mockResolvedValueOnce({ output: { refScript } });

    fetchDeployedScript
      .mockResolvedValueOnce({
        refScriptUtxo: "tx#0",
        unoptimizedCbor: "aa",
      })
      .mockResolvedValueOnce({
        refScriptUtxo: "tx#1",
        unoptimizedCbor: "bb",
      })
      .mockResolvedValueOnce({
        refScriptUtxo: "tx#2",
        unoptimizedCbor: "cc",
      })
      .mockResolvedValueOnce({
        refScriptUtxo: "tx#3",
        unoptimizedCbor: "dd",
      });

    const ok = await module.fetchAllDeployedScripts({ getUtxo } as never);
    expect(ok.ok).toBe(true);
    expect(getUtxo).toHaveBeenCalledTimes(4);

    fetchDeployedScript.mockReset();
    fetchDeployedScript.mockResolvedValueOnce({ refScriptUtxo: undefined });
    const invalid = await module.fetchAllDeployedScripts({ getUtxo } as never);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error).toContain("Mint Proxy has no Ref script UTxO");
    }

    fetchDeployedScript.mockReset();
    fetchDeployedScript.mockRejectedValueOnce(new Error("network"));
    const failed = await module.fetchAllDeployedScripts({ getUtxo } as never);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error).toContain("converted:network");
  });
});

describe("txs/order", () => {
  const makeBaseAddress = () =>
    ({
      era: "Shelley",
      spendingCredential: {
        kind: "PubKeyHash",
        toHex: () => "owner-pub-key-hash",
      },
    }) as never;

  it("covers request happy path and error branches", async () => {
    const {
      module,
      fetchHandlePriceInfoData,
      fetchDeployedScript,
      calculateHandlePriceFromHandlePriceInfo,
      makeTxBuilder,
    } = await setupOrderModule();

    fetchHandlePriceInfoData.mockResolvedValue({
      ok: false,
      error: "price-info-failed",
    });
    const failedPrice = await module.request({
      network: "preview",
      address: makeBaseAddress(),
      handle: "demo",
    });
    expect(failedPrice.ok).toBe(false);

    fetchHandlePriceInfoData.mockResolvedValue({
      ok: true,
      data: { handlePriceInfo: { current_data: [1n, 2n, 3n, 4n] } },
    });
    calculateHandlePriceFromHandlePriceInfo.mockReturnValue(2_000_000n);

    const byron = await module.request({
      network: "preview",
      address: { ...makeBaseAddress(), era: "Byron" },
      handle: "demo",
    });
    expect(byron.ok).toBe(false);

    const scriptAddress = await module.request({
      network: "preview",
      address: {
        ...makeBaseAddress(),
        spendingCredential: {
          kind: "ValidatorHash",
          toHex: () => "validator",
        },
      },
      handle: "demo",
    });
    expect(scriptAddress.ok).toBe(false);

    fetchDeployedScript.mockRejectedValueOnce(new Error("fetch-script-failed"));
    const deployedScriptFail = await module.request({
      network: "preview",
      address: makeBaseAddress(),
      handle: "demo",
    });
    expect(deployedScriptFail.ok).toBe(false);

    fetchDeployedScript.mockResolvedValueOnce({
      validatorHash: "orders-validator-hash",
    });
    const ok = await module.request({
      network: "preview",
      address: makeBaseAddress(),
      handle: "demo",
    });
    expect(ok.ok).toBe(true);
    const txBuilder = makeTxBuilder.mock.results[makeTxBuilder.mock.results.length - 1].value;
    expect(txBuilder.payUnsafe).toHaveBeenCalledTimes(1);
  });

  it("covers cancel flow, fetchOrdersTxInputs, and order validation", async () => {
    const {
      module,
      fetchDeployedScript,
      getUtxos,
      decodeOrderDatum,
      calculateHandlePriceFromHandlePrices,
    } = await setupOrderModule();

    const baseAddress = makeBaseAddress();

    fetchDeployedScript.mockResolvedValueOnce({
      cbor: undefined,
      unoptimizedCbor: undefined,
    });
    const missingCbor = await module.cancel({
      network: "preview",
      address: baseAddress,
      orderTxInput: { datum: { kind: "InlineTxOutputDatum" } },
    });
    expect(missingCbor.ok).toBe(false);

    fetchDeployedScript.mockResolvedValueOnce({
      cbor: "aa",
      unoptimizedCbor: "bb",
    });
    const cancelOk = await module.cancel({
      network: "preview",
      address: baseAddress,
      orderTxInput: { datum: { kind: "InlineTxOutputDatum" } },
    });
    expect(cancelOk.ok).toBe(true);

    getUtxos.mockRejectedValueOnce(new Error("utxo-fetch-failed"));
    const orderFetchFailed = await module.fetchOrdersTxInputs({
      network: "preview",
      ordersScriptDetail: { validatorHash: "orders-hash" },
      blockfrostApiKey: "preview-key",
    });
    expect(orderFetchFailed.ok).toBe(false);

    getUtxos.mockResolvedValueOnce([
      { datum: { a: 1 }, value: { lovelace: 2_000_000n }, id: "1" },
      { datum: { b: 2 }, value: { lovelace: 2_000_000n }, id: "2" },
    ]);
    decodeOrderDatum
      .mockImplementationOnce(() => {
        throw new Error("bad-datum");
      })
      .mockImplementationOnce(() => ({
        requested_handle: Buffer.from("ok").toString("hex"),
        destination_address: baseAddress,
      }));

    const filtered = await module.fetchOrdersTxInputs({
      network: "preview",
      ordersScriptDetail: { validatorHash: "orders-hash" },
      blockfrostApiKey: "preview-key",
    });
    expect(filtered.ok).toBe(true);
    if (filtered.ok) expect(filtered.data).toHaveLength(1);

    decodeOrderDatum.mockImplementationOnce(() => {
      throw new Error("decode-failed");
    });
    const invalidDecode = await module.isValidOrderTxInput({
      network: "preview",
      orderTxInput: {
        datum: {},
        value: { lovelace: 2_000_000n },
      },
      prevHandlePrices: { basic: 1, common: 1, rare: 1, ultraRare: 1 },
      currentHandlePrices: { basic: 1, common: 1, rare: 1, ultraRare: 1 },
    });
    expect(invalidDecode.ok).toBe(false);

    decodeOrderDatum.mockImplementation(() => ({
      requested_handle: Buffer.from("demo").toString("hex"),
      destination_address: baseAddress,
    }));
    calculateHandlePriceFromHandlePrices
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(10);
    const insufficient = await module.isValidOrderTxInput({
      network: "preview",
      orderTxInput: {
        datum: {},
        value: { lovelace: 1_000_000n },
      },
      prevHandlePrices: { basic: 1, common: 1, rare: 1, ultraRare: 1 },
      currentHandlePrices: { basic: 1, common: 1, rare: 1, ultraRare: 1 },
    });
    expect(insufficient.ok).toBe(false);

    calculateHandlePriceFromHandlePrices
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(1);
    const valid = await module.isValidOrderTxInput({
      network: "preview",
      orderTxInput: {
        datum: {},
        value: { lovelace: 2_000_000n },
      },
      prevHandlePrices: { basic: 1, common: 1, rare: 1, ultraRare: 1 },
      currentHandlePrices: { basic: 1, common: 1, rare: 1, ultraRare: 1 },
    });
    expect(valid.ok).toBe(true);
  });
});

describe("txs/staking", () => {
  it("registers staking address and returns tx cbor", async () => {
    vi.resetModules();
    const buildMock = vi.fn().mockResolvedValue({
      toCbor: () => Buffer.from("c0ffee", "hex"),
    });
    const addDCert = vi.fn();
    const makeTxBuilder = vi.fn(() => ({
      addDCert,
      build: buildMock,
    }));

    vi.doMock("@helios-lang/codec-utils", () => ({
      bytesToHex: (bytes: Buffer) => bytes.toString("hex"),
    }));
    vi.doMock("@helios-lang/ledger", () => ({
      makeRegistrationDCert: vi.fn((credential: unknown) => ({ credential })),
      parseStakingAddress: vi.fn(() => ({
        stakingCredential: "staking-credential",
      })),
    }));
    vi.doMock("@helios-lang/tx-utils", () => ({
      makeTxBuilder,
    }));

    const { registerStakingAddress } = await import("../src/txs/staking.js");
    const result = await registerStakingAddress(
      "preview",
      { addr: "change" } as never,
      [{ id: "spare" }] as never,
      "stake_test1_abc"
    );
    expect(makeTxBuilder).toHaveBeenCalledWith({ isMainnet: false });
    expect(addDCert).toHaveBeenCalledTimes(1);
    expect(buildMock).toHaveBeenCalledWith({
      changeAddress: { addr: "change" },
      spareUtxos: [{ id: "spare" }],
    });
    expect(result).toBe("c0ffee");
  });
});
