import { PubKeyHash } from "@helios-lang/ledger";
import { makeByteArrayData, makeConstrData, UplcData } from "@helios-lang/uplc";

const makeSignatureMultiSigScriptData = (pubKeyHash: PubKeyHash): UplcData => {
  return makeConstrData(0, [makeByteArrayData(pubKeyHash.toHex())]);
};

export { makeSignatureMultiSigScriptData };
