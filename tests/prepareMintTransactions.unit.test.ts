import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Trie } from "@aiken-lang/merkle-patricia-forestry";
import {
  makeAddress,
  makeInlineTxOutputDatum,
  makeTxInput,
  makeTxOutput,
  makeValue,
} from "@helios-lang/ledger";
import { Ok } from "ts-res";

import { buildMintingData } from "../src/contracts/index.js";
import { prepareLegacyMintTransaction } from "../src/txs/prepareLegacyMint.js";
import { prepareNewMintTransaction } from "../src/txs/prepareNewMint.js";

const TEST_ADDRESS =
  "addr_test1wp2nme22mmx9exl6spktuq6pm6wg4ruw7y7j36r2sy5yxvcl3hw78";
const TEST_POLICY_ID =
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_NETWORK = process.env.NETWORK;

const makeMintingDataInput = (rootHash: string) =>
  makeTxInput(
    "14c7a7e473946d983dd8f790f7c902861a70d355df6e9bee04a16799dd1ff9b7#0",
    makeTxOutput(
      makeAddress(TEST_ADDRESS),
      makeValue(BigInt(1340410), [
        [
          TEST_POLICY_ID,
          [[
            "000de14068616e646c655f726f6f744068616e646c655f73657474696e6773",
            1n,
          ]],
        ],
      ]),
      makeInlineTxOutputDatum(buildMintingData({ mpt_root_hash: rootHash }))
    )
  );

const makeReferenceInput = (id: string) =>
  makeTxInput(id, makeTxOutput(makeAddress(TEST_ADDRESS), makeValue(2_000_000n)));

describe("prepare mint transactions", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.NETWORK = "PREVIEW";
  });

  afterEach(() => {
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    }

    if (ORIGINAL_NETWORK === undefined) {
      delete process.env.NETWORK;
    } else {
      process.env.NETWORK = ORIGINAL_NETWORK;
    }
  });

  it("prepareNewMintTransaction uses injected minting data before builder-stage script validation", async () => {
    const db = await Trie.fromList([{ key: "existing-handle", value: "" }]);
    const currentRoot = db.hash.toString("hex");

    await expect(
      prepareNewMintTransaction(
        {
          handles: [],
          address: makeAddress(TEST_ADDRESS),
          db,
          blockfrostApiKey: "preview_test_key",
          latestHandlePrices: {
            basic: 35,
            common: 150,
            rare: 445,
            ultraRare: 995,
          },
        },
        {
          fetchAllDeployedScriptsFn: async () =>
            Ok({
              mintProxyScriptTxInput: makeReferenceInput(
                "14c7a7e473946d983dd8f790f7c902861a70d355df6e9bee04a16799dd1ff9b7#1"
              ),
              mintingDataScriptTxInput: makeReferenceInput(
                "14c7a7e473946d983dd8f790f7c902861a70d355df6e9bee04a16799dd1ff9b7#2"
              ),
              mintV1ScriptTxInput: makeReferenceInput(
                "14c7a7e473946d983dd8f790f7c902861a70d355df6e9bee04a16799dd1ff9b7#3"
              ),
              ordersScriptTxInput: makeReferenceInput(
                "14c7a7e473946d983dd8f790f7c902861a70d355df6e9bee04a16799dd1ff9b7#4"
              ),
              mintV1ScriptDetails: { validatorHash: "11".repeat(28) },
            } as any),
          fetchMintingDataFn: async () =>
            Ok({
              mintingData: { mpt_root_hash: currentRoot } as any,
              mintingDataAssetTxInput: makeMintingDataInput(currentRoot),
            }),
          fetchSettingsFn: async () =>
            Ok({
              settings: {} as any,
              settingsV1: {
                allowed_minters: ["22".repeat(28)],
                treasury_address: makeAddress(TEST_ADDRESS),
              } as any,
              settingsAssetTxInput: makeReferenceInput(
                "14c7a7e473946d983dd8f790f7c902861a70d355df6e9bee04a16799dd1ff9b7#5"
              ),
            }),
          fetchHandlePriceInfoDataFn: async () =>
            Ok({
              handlePriceInfo: {
                current_data: [995000000n, 445000000n, 150000000n, 35000000n],
                prev_data: [995000000n, 445000000n, 150000000n, 35000000n],
                updated_at: 0n,
              } as any,
              handlePriceInfoAssetTxInput: makeReferenceInput(
                "14c7a7e473946d983dd8f790f7c902861a70d355df6e9bee04a16799dd1ff9b7#6"
              ),
            }),
        }
      )
    ).rejects.toThrow(/input is locked by an unknown script/);
  });

  it("prepareNewMintTransaction rejects mismatched local and on-chain roots", async () => {
    const db = await Trie.fromList([{ key: "existing-handle", value: "" }]);

    const result = await prepareNewMintTransaction(
      {
        handles: [],
        address: makeAddress(TEST_ADDRESS),
        db,
        blockfrostApiKey: "preview_test_key",
        latestHandlePrices: {
          basic: 35,
          common: 150,
          rare: 445,
          ultraRare: 995,
        },
      },
      {
        fetchAllDeployedScriptsFn: async () =>
          Ok({
            mintProxyScriptTxInput: makeReferenceInput(
              "14c7a7e473946d983dd8f790f7c902861a70d355df6e9bee04a16799dd1ff9b7#1"
            ),
            mintingDataScriptTxInput: makeReferenceInput(
              "14c7a7e473946d983dd8f790f7c902861a70d355df6e9bee04a16799dd1ff9b7#2"
            ),
            mintV1ScriptTxInput: makeReferenceInput(
              "14c7a7e473946d983dd8f790f7c902861a70d355df6e9bee04a16799dd1ff9b7#3"
            ),
            ordersScriptTxInput: makeReferenceInput(
              "14c7a7e473946d983dd8f790f7c902861a70d355df6e9bee04a16799dd1ff9b7#4"
            ),
            mintV1ScriptDetails: { validatorHash: "11".repeat(28) },
          } as any),
        fetchMintingDataFn: async () =>
          Ok({
            mintingData: { mpt_root_hash: "deadbeef".padEnd(64, "0") } as any,
            mintingDataAssetTxInput: makeMintingDataInput(
              "deadbeef".padEnd(64, "0")
            ),
          }),
        fetchSettingsFn: async () =>
          Ok({
            settings: {} as any,
            settingsV1: {
              allowed_minters: ["22".repeat(28)],
              treasury_address: makeAddress(TEST_ADDRESS),
            } as any,
            settingsAssetTxInput: makeReferenceInput(
              "14c7a7e473946d983dd8f790f7c902861a70d355df6e9bee04a16799dd1ff9b7#5"
            ),
          }),
        fetchHandlePriceInfoDataFn: async () =>
          Ok({
            handlePriceInfo: {
              current_data: [995000000n, 445000000n, 150000000n, 35000000n],
              prev_data: [995000000n, 445000000n, 150000000n, 35000000n],
              updated_at: 0n,
            } as any,
            handlePriceInfoAssetTxInput: makeReferenceInput(
              "14c7a7e473946d983dd8f790f7c902861a70d355df6e9bee04a16799dd1ff9b7#6"
            ),
          }),
      }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/Local DB and On Chain Root Hash mismatch/);
  });

  it("prepareLegacyMintTransaction uses injected minting data before builder-stage script validation", async () => {
    const db = await Trie.fromList([{ key: "existing-handle", value: "" }]);
    const currentRoot = db.hash.toString("hex");
    const mintingDataAssetTxInput = makeTxInput(
      "14c7a7e473946d983dd8f790f7c902861a70d355df6e9bee04a16799dd1ff9b7#0",
      makeTxOutput(
        makeAddress(TEST_ADDRESS),
        makeValue(BigInt(1340410), [
          [
            TEST_POLICY_ID,
            [[
              "000de14068616e646c655f726f6f744068616e646c655f73657474696e6773",
              1n,
            ]],
          ],
        ])
      )
    );

    await expect(
      prepareLegacyMintTransaction(
        {
          handles: [],
          address: makeAddress(TEST_ADDRESS),
          db,
          blockfrostApiKey: "preview_test_key",
        },
        {
          fetchAllDeployedScriptsFn: async () =>
            Ok({
              mintingDataScriptTxInput: makeMintingDataInput(currentRoot),
            } as any),
          fetchMintingDataFn: async () =>
            Ok({
              mintingData: { mpt_root_hash: currentRoot } as any,
              mintingDataAssetTxInput,
            }),
        }
      )
    ).rejects.toThrow(/input is locked by an unknown script/);
  });

  it("prepareLegacyMintTransaction rejects mismatched local and on-chain roots", async () => {
    const db = await Trie.fromList([{ key: "existing-handle", value: "" }]);

    const result = await prepareLegacyMintTransaction(
      {
        handles: [],
        address: makeAddress(TEST_ADDRESS),
        db,
        blockfrostApiKey: "preview_test_key",
      },
      {
        fetchAllDeployedScriptsFn: async () =>
          Ok({
            mintingDataScriptTxInput: makeMintingDataInput(
              "deadbeef".padEnd(64, "0")
            ),
          } as any),
        fetchMintingDataFn: async () =>
          Ok({
            mintingData: { mpt_root_hash: "deadbeef".padEnd(64, "0") } as any,
            mintingDataAssetTxInput: makeMintingDataInput(
              "deadbeef".padEnd(64, "0")
            ),
          }),
      }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/Local DB and On Chain Root Hash mismatch/);
  });
});
