import { bytesToHex } from "@helios-lang/codec-utils";
import {
  Address,
  makeAssetClass,
  makeAssets,
  makeInlineTxOutputDatum,
  makeTxOutput,
  makeValue,
} from "@helios-lang/ledger";
import { makeTxBuilder, NetworkName } from "@helios-lang/tx-utils";
import { decodeUplcData, decodeUplcProgramV2FromCbor } from "@helios-lang/uplc";

import {
  BLOCKFROST_API_KEY,
  LEGACY_POLICY_ID,
  NETWORK,
  PREFIX_222,
} from "../../src/constants/index.js";
import { DeployData, getBlockfrostV0Client } from "../../src/index.js";

const deployContract = async ({
  deployData,
  handle,
  address,
  lockAddress,
}: {
  deployData: DeployData;
  handle: string;
  address: Address;
  lockAddress: Address;
}) => {
  const isMainnet = (NETWORK as NetworkName) == "mainnet";
  const blockfrostV0Client = getBlockfrostV0Client(BLOCKFROST_API_KEY);
  const { optimizedCbor, datumCbor } = deployData;

  const networkParams = await blockfrostV0Client.parameters;
  const txBuilder = makeTxBuilder({ isMainnet });
  const spareUtxos = await blockfrostV0Client.getUtxos(address);

  const handleValue = makeValue(
    1n,
    makeAssets([
      [
        makeAssetClass(
          `${LEGACY_POLICY_ID}.${PREFIX_222}${Buffer.from(handle).toString(
            "hex"
          )}`
        ),
        1n,
      ],
    ])
  );
  const handleUtxoIndex = spareUtxos.findIndex((utxo) =>
    utxo.value.isGreaterOrEqual(handleValue)
  );
  if (handleUtxoIndex < 0) throw new Error(`${handle} not found in wallet`);

  const handleUtxo = spareUtxos[handleUtxoIndex];
  txBuilder.spendUnsafe(handleUtxo);
  spareUtxos.splice(handleUtxoIndex, 1);

  const uplcProgram = decodeUplcProgramV2FromCbor(optimizedCbor);
  const output = makeTxOutput(
    lockAddress,
    handleValue,
    datumCbor ? makeInlineTxOutputDatum(decodeUplcData(datumCbor)) : undefined,
    uplcProgram
  );
  output.correctLovelace(networkParams);
  txBuilder.addOutput(output);

  const tx = await txBuilder.build({
    changeAddress: address,
    spareUtxos: spareUtxos,
  });

  return bytesToHex(tx.toCbor());
};

export { deployContract };
