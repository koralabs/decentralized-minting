import { Buffer } from "node:buffer";

import type { Cardano as CardanoTypes } from "@cardano-sdk/core";

import {
  Cardano,
  type HexBlob,
  Serialization,
} from "../../helpers/cardano-sdk/index.js";

/**
 * Canonical Plutus data representation used throughout the package —
 * re-exports `@cardano-sdk/core`'s `Cardano.PlutusData` Core shape:
 *
 *   bigint                                             - integer
 *   Uint8Array                                         - byte string
 *   { items: PlutusData[] }                            - list
 *   { data: Map<PlutusData, PlutusData> }              - map
 *   { constructor: bigint, fields: PlutusList }        - constr
 */
export type PlutusData = CardanoTypes.PlutusData;
export type PlutusList = CardanoTypes.PlutusList;

/* ---------- constructors ---------- */

export const mkInt = (value: bigint | number): PlutusData => BigInt(value);

export const mkBytes = (hex: string): PlutusData => {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Buffer.from(clean, "hex");
};

export const mkList = (items: PlutusData[]): PlutusData => ({ items });

export const mkMap = (
  entries: Array<[PlutusData, PlutusData]>,
): PlutusData => {
  const m = new Map<PlutusData, PlutusData>();
  for (const [k, v] of entries) m.set(k, v);
  return { data: m };
};

export const mkConstr = (
  tag: number | bigint,
  fields: PlutusData[],
): PlutusData => ({
  constructor: BigInt(tag),
  fields: { items: fields },
});

/* ---------- CBOR round-trip ---------- */

export const plutusDataToCbor = (data: PlutusData): string =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Serialization as any).PlutusData.fromCore(data).toCbor() as string;

export const plutusDataFromCbor = (cbor: string): PlutusData =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Serialization as any)
    .PlutusData.fromCbor(cbor as HexBlob)
    .toCore() as PlutusData;

/* ---------- expectors ---------- */

export const isBytes = (data: PlutusData): data is Uint8Array =>
  data instanceof Uint8Array;

// `"constructor" in obj` is true for every plain object (inherited from
// Object.prototype), so the discriminators check for the *own* property.
const hasOwn = (o: object, key: string) =>
  Object.prototype.hasOwnProperty.call(o, key);

export const isList = (data: PlutusData): data is CardanoTypes.PlutusList =>
  typeof data === "object" &&
  data !== null &&
  !isBytes(data) &&
  hasOwn(data, "items") &&
  !hasOwn(data, "constructor");

export const isMap = (data: PlutusData): data is CardanoTypes.PlutusMap =>
  typeof data === "object" &&
  data !== null &&
  !isBytes(data) &&
  hasOwn(data, "data");

export const isConstr = (
  data: PlutusData,
): data is CardanoTypes.ConstrPlutusData =>
  typeof data === "object" &&
  data !== null &&
  !isBytes(data) &&
  hasOwn(data, "constructor") &&
  hasOwn(data, "fields");

export const expectConstr = (
  data: PlutusData,
  tag?: number,
  fieldCount?: number,
  label?: string,
): CardanoTypes.ConstrPlutusData => {
  if (!isConstr(data)) {
    throw new Error(`${label ?? "expected Constr"} (got non-constr)`);
  }
  if (tag !== undefined && data.constructor !== BigInt(tag)) {
    throw new Error(
      `${label ?? "Constr"}: expected tag ${tag}, got ${data.constructor}`,
    );
  }
  if (fieldCount !== undefined && data.fields.items.length !== fieldCount) {
    throw new Error(
      `${label ?? "Constr"}: expected ${fieldCount} fields, got ${data.fields.items.length}`,
    );
  }
  return data;
};

export const expectInt = (data: PlutusData, label?: string): bigint => {
  if (typeof data !== "bigint") {
    throw new Error(`${label ?? "expected Int"} (got ${typeof data})`);
  }
  return data;
};

export const expectBytesHex = (data: PlutusData, label?: string): string => {
  if (data instanceof Uint8Array) {
    return Buffer.from(data).toString("hex");
  }
  throw new Error(`${label ?? "expected Bytes"}`);
};

export const expectList = (
  data: PlutusData,
  label?: string,
): PlutusData[] => {
  if (!isList(data)) {
    throw new Error(`${label ?? "expected List"}`);
  }
  return data.items;
};

/* ---------- common plutus shapes ---------- */

export const mkBool = (value: boolean): PlutusData =>
  mkConstr(value ? 1 : 0, []);

/** Unit / Void — constr tag 0, no fields. CBOR: d87980. */
export const mkUnit = (): PlutusData => mkConstr(0, []);

/** Wrap data in a Plutus V1 redeemer wrapper: `Constr 1 [inner]`. */
export const mkRedeemerWrapper = (inner: PlutusData): PlutusData =>
  mkConstr(1, [inner]);

/* ---------- addresses + credentials ---------- */

/**
 * Build the Plutus `Credential` data shape:
 *   PubKeyCredential Bytes    = Constr 0 [Bytes]
 *   ScriptCredential Bytes    = Constr 1 [Bytes]
 */
export const buildCredentialData = (
  credential: CardanoTypes.Credential,
): PlutusData =>
  mkConstr(
    credential.type === Cardano.CredentialType.KeyHash ? 0 : 1,
    [mkBytes(credential.hash as unknown as string)],
  );

/**
 * Build the Plutus `Option<StakingCredential>` data shape:
 *   None                               = Constr 1 []
 *   Some (StakingHash credential)      = Constr 0 [Constr 0 [credential]]
 */
export const buildOptionalStakingCredentialData = (
  stakingCredential?: CardanoTypes.Credential,
): PlutusData => {
  if (!stakingCredential) return mkConstr(1, []);
  return mkConstr(0, [
    mkConstr(0, [buildCredentialData(stakingCredential)]),
  ]);
};

/**
 * Build the Plutus `Address` data shape for a Cardano base/enterprise
 * address.
 *
 *   Address = Constr 0 [Credential, Option<StakingCredential>]
 */
export const buildAddressData = (addressBech32: string): PlutusData => {
  const parsed = Cardano.Address.fromString(addressBech32.trim());
  if (!parsed) throw new Error(`invalid address: ${addressBech32}`);

  const base = parsed.asBase();
  const enterprise = parsed.asEnterprise();
  const paymentCred =
    base?.getPaymentCredential() ?? enterprise?.getPaymentCredential();
  if (!paymentCred) {
    throw new Error(`address has no payment credential: ${addressBech32}`);
  }
  const stakingCred = base?.getStakeCredential();

  return mkConstr(0, [
    buildCredentialData(paymentCred),
    buildOptionalStakingCredentialData(stakingCred),
  ]);
};

/**
 * Decode a Plutus `Credential` back to the cardano-sdk Core shape.
 */
export const decodeCredentialFromData = (
  data: PlutusData,
): CardanoTypes.Credential => {
  const c = expectConstr(data, undefined, 1, "Credential");
  const hash = expectBytesHex(c.fields.items[0], "credential hash");
  return {
    type:
      c.constructor === 0n
        ? Cardano.CredentialType.KeyHash
        : Cardano.CredentialType.ScriptHash,
    hash: hash as unknown as CardanoTypes.Credential["hash"],
  };
};

export const decodeOptionalStakingCredentialFromData = (
  data: PlutusData,
): CardanoTypes.Credential | undefined => {
  const outer = expectConstr(data, undefined, undefined, "StakingCredential?");
  if (outer.constructor === 1n) return undefined;
  const inner = expectConstr(
    outer.fields.items[0],
    0,
    1,
    "StakingHash wrapper",
  );
  return decodeCredentialFromData(inner.fields.items[0]);
};

/**
 * Decode a Plutus address to bech32. Requires the `network` because the
 * Plutus address is agnostic to mainnet vs testnet.
 */
export const decodeAddressFromData = (
  data: PlutusData,
  network: "mainnet" | "preprod" | "preview",
): string => {
  const isMainnet = network === "mainnet";
  const networkId = isMainnet ? 1 : 0;
  const addrConstr = expectConstr(data, 0, 2, "Address");
  const paymentCred = decodeCredentialFromData(addrConstr.fields.items[0]);
  const stakingCred = decodeOptionalStakingCredentialFromData(
    addrConstr.fields.items[1],
  );

  if (stakingCred) {
    const baseAddr = Cardano.BaseAddress.fromCredentials(
      networkId,
      paymentCred,
      stakingCred,
    );
    return baseAddr.toAddress().toBech32() as string;
  }
  const enterprise = Cardano.EnterpriseAddress.fromCredentials(
    networkId,
    paymentCred,
  );
  return enterprise.toAddress().toBech32() as string;
};
