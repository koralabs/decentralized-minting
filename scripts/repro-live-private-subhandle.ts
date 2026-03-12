import { bytesToHex } from "@helios-lang/codec-utils";
import {
  makeAssetClass,
  makeAssets,
  makeDummyAddress,
  makeInlineTxOutputDatum,
  makeMintingPolicyHash,
  makeTxOutput,
  makeTxOutputId,
  makeValidatorHash,
  makeValue,
} from "@helios-lang/ledger";
import {
  makeEmulator,
  makeTxBuilder,
  type NetworkName,
  type SimpleWallet,
} from "@helios-lang/tx-utils";
import { decodeUplcProgramV2FromCbor, type UplcProgramV2 } from "@helios-lang/uplc";

import {
  buildContracts,
  buildMintingData,
  buildMintingDataMintLegacyHandlesRedeemer,
  type LegacyHandleProof,
  makeVoidData,
  mayFailTransaction,
} from "../src/index.js";
import { alwaysSucceedMintUplcProgram, extractScriptCborsFromUplcProgram } from "../tests/utils.js";

const network: NetworkName = "preprod";
const isMainnet = false;
const accountLovelace = 5_000_000_000n;
const minLovelace = 5_000_000n;

const oldRoot = "f9543a00264bfb215dad345720b26b389340657706548761b24cad1d50052ab4";
const newRoot = "279aaf858414739cc7bcad0d8bb428b1116dff9fedfaea77f574bdb853faf088";
const handleName = "pntbt3d6@lgtbm8ad";
const proof: LegacyHandleProof = {
  handle_name: Buffer.from(handleName, "utf8").toString("hex"),
  is_virtual: 0n,
  mpt_proof: [
    {
      type: "branch",
      skip: 0,
      neighbors:
        "f9cc7a1a5ff1479e1e3931bb3d2f8c4ebcea52a49623c6beaa926fbf4ddc8b70a03c2ef46ae6dc82a4c3bf6f1c73a8721dbb6c92bd8f36d0ff558bcbe435dd706a68dfd6c57600b10e8aaa6a2a1728b76662e685cf30f1f468c4fd7689f266d696e3ffa2ceaf2643850534e19544ff84a3c2957f9a3812ed68ff0602b66a55fa",
    },
    {
      type: "branch",
      skip: 0,
      neighbors:
        "98b035a0ca7abe625bb871107f2ef27234cdf86497c55e256c2c71f56d0d2e597e84ae7e612fb60049f9aa09b7cd7b707adcf49e1c7183f676b7f35f307e6caeebe1ee4308f3a95b6063eb076459b919c6d93d0a611e79298e3910a61fcb7ba63850c196ab07dd865a3ce3420d1ec7e6b3522764a3b35fec312cc5fbde5ddbae",
    },
    {
      type: "branch",
      skip: 0,
      neighbors:
        "863d2a036c4d08ae950d4a61db532fd40f44f3beb762f79ac8eb2d589c5e0904e1d412136f808c24bf6531b8c80e9f2001a108f7f0ab67677ee775795d0a027892bb683922ec9fa52520c1de74998c6bc33dbe70c99375e4c1f7d3cfe0a2a07da5dbf31c58868bc02873517a3775f12e38dd85213f575a6d69468e20e4d1c71e",
    },
    {
      type: "leaf",
      skip: 0,
      key: "e5d79e2c62e9841c0d7e8354d0f4d5fe1f6f83dc29391870144882fd7ea51868",
      value: "0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8",
    },
  ],
};

const mintingDataAssetClass = makeAssetClass(
  "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de14068616e646c655f726f6f744068616e646c655f73657474696e6773",
);

const deployScript = async (
  emulator: ReturnType<typeof makeEmulator>,
  wallet: SimpleWallet,
  cbor: string,
  unoptimizedCbor: string,
) => {
  const txBuilder = makeTxBuilder({ isMainnet });
  const uplcProgram = decodeUplcProgramV2FromCbor(cbor);
  const output = makeTxOutput(makeDummyAddress(isMainnet), makeValue(1n), undefined, uplcProgram);
  output.correctLovelace(emulator.parametersSync);
  txBuilder.addOutput(output);
  const tx = await txBuilder.build({
    changeAddress: wallet.address,
    spareUtxos: await wallet.utxos,
  });
  tx.addSignatures(await wallet.signTx(tx));
  const txId = await wallet.submitTx(tx);
  emulator.tick(200);
  const refTxInput = await emulator.getUtxo(makeTxOutputId(txId, 0));
  refTxInput.output.refScript = (refTxInput.output.refScript! as UplcProgramV2).withAlt(
    decodeUplcProgramV2FromCbor(unoptimizedCbor),
  );
  return refTxInput;
};

const userAssetClass = (policyId: string, name: string) =>
  makeAssetClass(`${policyId}.000de140${Buffer.from(name, "utf8").toString("hex")}`);
const referenceAssetClass = (policyId: string, name: string) =>
  makeAssetClass(`${policyId}.000643b0${Buffer.from(name, "utf8").toString("hex")}`);

const main = async () => {
  const emulator = makeEmulator();
  const legacyMintUplcProgram = alwaysSucceedMintUplcProgram();
  const legacyPolicyId = makeMintingPolicyHash(legacyMintUplcProgram.hash()).toHex();
  const adminWallet = emulator.createWallet(accountLovelace);
  emulator.tick(200);
  const minterWallet = emulator.createWallet(accountLovelace);
  emulator.tick(200);
  const userWallet = emulator.createWallet(accountLovelace);
  emulator.tick(200);
  const pzWallet = emulator.createWallet(accountLovelace);
  emulator.tick(200);
  const fundWallet = emulator.createWallet(
    accountLovelace,
    makeAssets([[mintingDataAssetClass, 1n]]),
  );
  emulator.tick(200);

  const contracts = buildContracts({
    network,
    mint_version: 0n,
    legacy_policy_id: legacyPolicyId,
    admin_verification_key_hash: adminWallet.spendingPubKeyHash.toHex(),
  });

  const prepareAssetsTxBuilder = makeTxBuilder({ isMainnet });
  prepareAssetsTxBuilder.spendUnsafe(await fundWallet.utxos);
  prepareAssetsTxBuilder.payUnsafe(
    contracts.mintingData.mintingDataValidatorAddress,
    makeValue(minLovelace, makeAssets([[mintingDataAssetClass, 1n]])),
    makeInlineTxOutputDatum(buildMintingData({ mpt_root_hash: oldRoot })),
  );
  const prepareAssetsTx = await prepareAssetsTxBuilder.build({ changeAddress: fundWallet.address });
  prepareAssetsTx.addSignatures(await fundWallet.signTx(prepareAssetsTx));
  const prepareAssetsTxId = await fundWallet.submitTx(prepareAssetsTx);
  emulator.tick(200);
  const mintingDataAssetTxInput = await emulator.getUtxo(makeTxOutputId(prepareAssetsTxId, 0));

  const mintingDataScriptTxInput = await deployScript(
    emulator,
    pzWallet,
    ...extractScriptCborsFromUplcProgram(contracts.mintingData.mintingDataSpendUplcProgram),
  );

  const txBuilder = makeTxBuilder({ isMainnet });
  txBuilder.refer(mintingDataScriptTxInput);
  txBuilder.spendUnsafe(
    mintingDataAssetTxInput,
    buildMintingDataMintLegacyHandlesRedeemer([proof]),
  );
  txBuilder.payUnsafe(
    mintingDataAssetTxInput.address,
    makeValue(mintingDataAssetTxInput.value.lovelace, mintingDataAssetTxInput.value.assets),
    makeInlineTxOutputDatum(buildMintingData({ mpt_root_hash: newRoot })),
  );
  txBuilder.attachUplcProgram(legacyMintUplcProgram);
  txBuilder.mintPolicyTokensUnsafe(
    legacyPolicyId,
    [
      [referenceAssetClass(legacyPolicyId, handleName).tokenName, 1n],
      [userAssetClass(legacyPolicyId, handleName).tokenName, 1n],
    ],
    makeVoidData(),
  );
  txBuilder.payUnsafe(
    pzWallet.address,
    makeValue(1n, makeAssets([[referenceAssetClass(legacyPolicyId, handleName), 1n]])),
  );
  txBuilder.payUnsafe(
    userWallet.address,
    makeValue(1n, makeAssets([[userAssetClass(legacyPolicyId, handleName), 1n]])),
  );

  const txResult = await mayFailTransaction(
    txBuilder,
    minterWallet.address,
    await minterWallet.utxos,
  ).complete();

  if (!txResult.ok) {
    console.error("FAILED");
    console.error(txResult.error);
    process.exit(1);
  }

  console.log("PASSED");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
