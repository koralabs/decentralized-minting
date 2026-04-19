import { mkBytes, mkConstr, PlutusData } from "./plutusData.js";

/** Native-script-style signature multisig: `Constr 0 [PubKeyHash]`. */
const makeSignatureMultiSigScriptData = (pubKeyHashHex: string): PlutusData =>
  mkConstr(0, [mkBytes(pubKeyHashHex)]);

export { makeSignatureMultiSigScriptData };
