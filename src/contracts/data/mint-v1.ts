import { mkConstr, PlutusData } from "./plutusData.js";

const buildMintV1MintHandlesRedeemer = (): PlutusData => mkConstr(0, []);

const buildMintV1BurnHandlesRedeemer = (): PlutusData => mkConstr(1, []);

export { buildMintV1BurnHandlesRedeemer, buildMintV1MintHandlesRedeemer };
