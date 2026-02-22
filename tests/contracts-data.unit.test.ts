import {
  makeAddress,
  makeDatumHash,
  makeDummyAddress,
  makeHashedTxOutputDatum,
  makeInlineTxOutputDatum,
  makePubKeyHash,
  makeStakingValidatorHash,
  makeValidatorHash,
} from "@helios-lang/ledger";
import {
  decodeUplcData,
  makeByteArrayData,
  makeConstrData,
  makeIntData,
} from "@helios-lang/uplc";
import { describe, expect, it } from "vitest";

import {
  buildAddressData,
  buildCredentialData,
  buildDatumData,
  buildingStakingCredentialData,
  decodeAddressFromData,
  decodeCredentialFromData,
  decodeDatumFromData,
  decodeStakingCredentialFromData,
  makeBoolData,
  makeRedeemerWrapper,
  makeVoidData,
} from "../src/contracts/data/common.js";
import {
  buildHandlePriceInfoData,
  decodeHandlePriceInfoDatum,
} from "../src/contracts/data/handle_price.js";
import {
  buildMintingData,
  buildMintingDataMintLegacyHandlesRedeemer,
  buildMintingDataMintNewHandlesRedeemer,
  decodeMintingDataDatum,
} from "../src/contracts/data/minting_data.js";
import {
  buildMPTProofData,
  buildMPTProofStepData,
  buildNeighborData,
} from "../src/contracts/data/mpt.js";
import { buildOrderCancelRedeemer, buildOrderData, decodeOrderDatum } from "../src/contracts/data/order.js";
import { buildSettingsData, decodeSettingsDatum } from "../src/contracts/data/settings.js";
import {
  buildSettingsV1Data,
  decodeSettingsV1Data,
} from "../src/contracts/data/settings-v1.js";
import {
  buildOwnerSettingsData,
  buildSubHandleSettingsData,
  buildTierPricingData,
} from "../src/contracts/data/sub_handle.js";
import {
  makeMintingDataUplcProgramParameter,
  makeMintingDataUplcProgramParameterDatum,
  makeMintProxyUplcProgramParameter,
  makeMintProxyUplcProgramParameterDatum,
  makeMintV1UplcProgramParameter,
  makeMintV1UplcProgramParameterDatum,
} from "../src/contracts/utils.js";

describe("contracts data encoders/decoders", () => {
  it("builds and decodes credential/address data", () => {
    const pubKeyCredential = makePubKeyHash("11".repeat(28));
    const scriptCredential = makeValidatorHash("22".repeat(28));

    const pubKeyData = buildCredentialData(pubKeyCredential);
    const scriptData = buildCredentialData(scriptCredential);
    expect(decodeCredentialFromData(pubKeyData).toHex()).toBe(pubKeyCredential.toHex());
    expect(decodeCredentialFromData(scriptData).toHex()).toBe(scriptCredential.toHex());

    expect(() =>
      decodeCredentialFromData(makeConstrData(2, [makeByteArrayData("aa")]))
    ).toThrow("Invalid Credential Constr Tag");

    const noneStake = buildingStakingCredentialData(undefined);
    expect(decodeStakingCredentialFromData(noneStake)).toBeUndefined();

    const pubStake = buildingStakingCredentialData(pubKeyCredential);
    expect(decodeStakingCredentialFromData(pubStake)?.toHex()).toBe(
      pubKeyCredential.toHex()
    );

    const stakingScript = makeStakingValidatorHash("33".repeat(28));
    const scriptStake = buildingStakingCredentialData(stakingScript);
    expect(decodeStakingCredentialFromData(scriptStake)?.toHex()).toBe(
      stakingScript.toHex()
    );

    expect(() =>
      decodeStakingCredentialFromData(
        makeConstrData(0, [makeConstrData(0, [makeConstrData(2, [makeByteArrayData("aa")])])])
      )
    ).toThrow("Invalid Credential Constr Tag");

    const address = makeAddress(false, pubKeyCredential, stakingScript);
    const addressData = buildAddressData(address);
    const decodedAddress = decodeAddressFromData(addressData, "preview");
    expect(decodedAddress.toBech32()).toBe(address.toBech32());
  });

  it("builds and decodes datum variants", () => {
    const inline = makeInlineTxOutputDatum(makeIntData(99n));
    const hashed = makeHashedTxOutputDatum(makeDatumHash("aa".repeat(32)));

    const inlineData = buildDatumData(inline);
    const hashedData = buildDatumData(hashed);
    const noneData = buildDatumData(undefined);

    expect(decodeDatumFromData(inlineData)?.kind).toBe("InlineTxOutputDatum");
    expect(decodeDatumFromData(hashedData)?.kind).toBe("HashedTxOutputDatum");
    expect(decodeDatumFromData(noneData)).toBeUndefined();

    expect(() => decodeDatumFromData(makeConstrData(3, []))).toThrow(
      "Invalid Datum Constr Tag"
    );
  });

  it("builds void/redeemer/bool helper data", () => {
    expect(makeBoolData(true).toCbor().length).toBeGreaterThan(0);
    expect(makeBoolData(false).toCbor().length).toBeGreaterThan(0);
    expect(makeVoidData().toCbor().length).toBeGreaterThan(0);
    expect(makeRedeemerWrapper(makeIntData(1n)).toCbor().length).toBeGreaterThan(0);
  });

  it("builds and decodes settings and settings-v1", () => {
    const sampleAddress = makeDummyAddress(false);
    const settingsV1 = {
      policy_id: "ab".repeat(28),
      allowed_minters: ["cd".repeat(28)],
      valid_handle_price_assets: ["ef".repeat(28) + ".01"],
      treasury_address: sampleAddress,
      treasury_fee_percentage: 10n,
      pz_script_address: sampleAddress,
      order_script_hash: "ff".repeat(28),
      minting_data_script_hash: "11".repeat(28),
    };
    const settingsV1Data = buildSettingsV1Data(settingsV1);
    const decodedV1 = decodeSettingsV1Data(settingsV1Data, "preview");
    expect(decodedV1.policy_id).toBe(settingsV1.policy_id);
    expect(decodedV1.allowed_minters).toEqual(settingsV1.allowed_minters);

    const settings = {
      mint_governor: "aa".repeat(28),
      mint_version: 7n,
      data: settingsV1Data,
    };
    const settingsData = buildSettingsData(settings);
    const decoded = decodeSettingsDatum(makeInlineTxOutputDatum(settingsData));
    expect(decoded.mint_governor).toBe(settings.mint_governor);
    expect(decoded.mint_version).toBe(settings.mint_version);

    expect(() => decodeSettingsDatum(undefined)).toThrow("inline datum");
  });

  it("builds and decodes handle price / minting data / order data", () => {
    const handlePriceInfo = {
      current_data: [4_000_000n, 3_000_000n, 2_000_000n, 1_000_000n],
      prev_data: [4_000_000n, 3_000_000n, 2_000_000n, 1_000_000n],
      updated_at: 123n,
    };
    const handlePriceData = buildHandlePriceInfoData(handlePriceInfo);
    const decodedHandlePrice = decodeHandlePriceInfoDatum(
      makeInlineTxOutputDatum(handlePriceData)
    );
    expect(decodedHandlePrice.updated_at).toBe(123n);

    const mintingData = { mpt_root_hash: "ab".repeat(32) };
    const mintingDataUplc = buildMintingData(mintingData);
    const decodedMintingData = decodeMintingDataDatum(
      makeInlineTxOutputDatum(mintingDataUplc)
    );
    expect(decodedMintingData.mpt_root_hash).toBe(mintingData.mpt_root_hash);
    expect(
      buildMintingDataMintLegacyHandlesRedeemer([
        {
          mpt_proof: [{ type: "leaf", skip: 0, key: "aa", value: "bb" }],
          handle_name: "aa",
          is_virtual: 0n,
        },
      ]).toCbor().length
    ).toBeGreaterThan(0);
    expect(
      buildMintingDataMintNewHandlesRedeemer(
        [[{ type: "leaf", skip: 0, key: "aa", value: "bb" }]],
        0n
      ).toCbor().length
    ).toBeGreaterThan(0);

    const destination = makeDummyAddress(false);
    const orderData = buildOrderData({
      owner: makePubKeyHash("44".repeat(28)),
      requested_handle: "74657374",
      destination_address: destination,
    });
    const order = decodeOrderDatum(makeInlineTxOutputDatum(orderData), "preview");
    expect(order.requested_handle).toBe("74657374");
    expect(buildOrderCancelRedeemer().toCbor().length).toBeGreaterThan(0);
  });

  it("builds sub-handle and mpt proof helper data", () => {
    const stylesData = decodeUplcData(Buffer.from("d87980", "hex"));
    const subHandleSettings = {
      public_minting_enabled: 1n,
      pz_enabled: 1n,
      tier_pricing: [
        [1n, 10n],
        [5n, 20n],
      ],
      default_styles: stylesData,
      save_original_address: 1n,
    };
    expect(buildTierPricingData(subHandleSettings.tier_pricing).toCbor().length).toBeGreaterThan(0);
    expect(buildSubHandleSettingsData(subHandleSettings).toCbor().length).toBeGreaterThan(0);
    expect(
      buildOwnerSettingsData({
        nft: subHandleSettings,
        virtual: subHandleSettings,
        buy_down_price: 1n,
        buy_down_paid: 0n,
        buy_down_percent: 1n,
        agreed_terms: makeIntData(1n),
        migrate_sig_required: 0n,
        payment_address: "aa",
      }).toCbor().length
    ).toBeGreaterThan(0);

    const proof = [
      { type: "branch", skip: 1, neighbors: "aa" } as const,
      { type: "fork", skip: 2, neighbor: { nibble: 1, prefix: "bb", root: "cc" } } as const,
      { type: "leaf", skip: 3, key: "dd", value: "ee" } as const,
    ];
    expect(buildMPTProofData(proof).toCbor().length).toBeGreaterThan(0);
    expect(buildMPTProofStepData(proof[0]).toCbor().length).toBeGreaterThan(0);
    expect(buildMPTProofStepData(proof[1]).toCbor().length).toBeGreaterThan(0);
    expect(buildMPTProofStepData(proof[2]).toCbor().length).toBeGreaterThan(0);
    expect(buildNeighborData(proof[1].neighbor).toCbor().length).toBeGreaterThan(0);
  });

  it("builds contract parameter helper values and datums", () => {
    expect(makeMintProxyUplcProgramParameter(1n)).toHaveLength(1);
    expect(makeMintProxyUplcProgramParameterDatum(1n).data.toCbor().length).toBeGreaterThan(0);
    expect(makeMintV1UplcProgramParameter("aa")).toHaveLength(1);
    expect(makeMintV1UplcProgramParameterDatum("aa").data.toCbor().length).toBeGreaterThan(0);
    expect(makeMintingDataUplcProgramParameter("aa", "bb")).toHaveLength(2);
    expect(
      makeMintingDataUplcProgramParameterDatum("aa", "bb").data.toCbor().length
    ).toBeGreaterThan(0);
  });
});
