import { createRequire } from "node:module";

// Enable Conway-era set tagging before any tx CBOR is built.
const require = createRequire(import.meta.url);
const { setInConwayEra } = require("@cardano-sdk/core") as {
  setInConwayEra: (value: boolean) => boolean;
};

setInConwayEra(true);
