import {
  makeAddress,
  makeDatumHash,
  makeHashedTxOutputDatum,
  makeInlineTxOutputDatum,
  makePubKeyHash,
  makeStakingValidatorHash,
  makeValidatorHash,
  ShelleyAddress,
  SpendingCredential,
  StakingCredential,
  TxOutputDatum,
} from "@helios-lang/ledger";
import { NetworkName } from "@helios-lang/tx-utils";
import {
  decodeUplcData,
  expectByteArrayData,
  expectConstrData,
  makeByteArrayData,
  makeConstrData,
  UplcData,
} from "@helios-lang/uplc";

const buildCredentialData = (credential: SpendingCredential): UplcData => {
  return makeConstrData(credential.kind == "PubKeyHash" ? 0 : 1, [
    makeByteArrayData(credential.toHex()),
  ]);
};

const decodeCredentialFromData = (data: UplcData): SpendingCredential => {
  const credentialConstrData = expectConstrData(data, undefined, 1);
  if (credentialConstrData.tag === 0) {
    // verification key credential
    return makePubKeyHash(
      expectByteArrayData(credentialConstrData.fields[0]).toHex()
    );
  } else if (credentialConstrData.tag === 1) {
    // script credential
    return makeValidatorHash(
      expectByteArrayData(credentialConstrData.fields[0]).toHex()
    );
  } else {
    throw new Error("Invalid Credential Constr Tag");
  }
};

const buildingStakingCredentialData = (
  stakingCredential: StakingCredential | undefined
): UplcData => {
  if (!stakingCredential) return makeConstrData(1, []);
  return makeConstrData(0, [
    makeConstrData(0, [
      makeConstrData(stakingCredential.kind == "PubKeyHash" ? 0 : 1, [
        makeByteArrayData(stakingCredential.toHex()),
      ]),
    ]),
  ]);
};

const decodeStakingCredentialFromData = (
  data: UplcData
): StakingCredential | undefined => {
  const stakingCredentialOptConstrData = expectConstrData(data);
  if (stakingCredentialOptConstrData.tag == 0) {
    // staking credential opt is Some
    const stakeCredentialConstrData = expectConstrData(
      stakingCredentialOptConstrData.fields[0],
      0,
      1
    );
    const credentialConstrData = expectConstrData(
      stakeCredentialConstrData.fields[0],
      undefined,
      1
    );
    if (credentialConstrData.tag === 0) {
      // verification key credential
      return makePubKeyHash(
        expectByteArrayData(credentialConstrData.fields[0]).toHex()
      );
    } else if (credentialConstrData.tag === 1) {
      // staking script credential
      return makeStakingValidatorHash(
        expectByteArrayData(credentialConstrData.fields[0]).toHex()
      );
    } else {
      throw new Error("Invalid Credential Constr Tag");
    }
  } else {
    return undefined;
  }
};

const buildAddressData = (address: ShelleyAddress): UplcData => {
  const { spendingCredential, stakingCredential } = address;
  return makeConstrData(0, [
    buildCredentialData(spendingCredential),
    buildingStakingCredentialData(stakingCredential),
  ]);
};

const decodeAddressFromData = (
  data: UplcData,
  network: NetworkName
): ShelleyAddress => {
  const isMainnet = network == "mainnet";
  const addressConstrData = expectConstrData(data, 0, 2);
  const spendingCredential = decodeCredentialFromData(
    addressConstrData.fields[0]
  );
  const stakingCredential = decodeStakingCredentialFromData(
    addressConstrData.fields[1]
  );
  return makeAddress(isMainnet, spendingCredential, stakingCredential);
};

const decodeDatumFromData = (data: UplcData): TxOutputDatum | undefined => {
  const constrData = expectConstrData(data);
  if (constrData.tag == 0) {
    // NoDatum
    return undefined;
  } else if (constrData.tag == 1) {
    // DatumHash
    return makeHashedTxOutputDatum(
      makeDatumHash(expectByteArrayData(constrData.fields[0]))
    );
  } else if (constrData.tag == 2) {
    // InlineDatum
    return makeInlineTxOutputDatum(constrData.fields[0]);
  } else {
    throw new Error("Invalid Datum Constr Tag");
  }
};

const buildDatumData = (datum: TxOutputDatum | undefined): UplcData => {
  if (!datum) {
    // Nodatum
    return makeConstrData(0, []);
  } else if (datum.kind == "HashedTxOutputDatum") {
    // DatumHash
    return makeConstrData(1, [makeByteArrayData(datum.hash.toHex())]);
  } else {
    // InlineDatum
    return makeConstrData(2, [datum.data]);
  }
};

const makeVoidData = (): UplcData =>
  decodeUplcData(Buffer.from("d87980", "hex"));

const makeRedeemerWrapper = (data: UplcData): UplcData => {
  return makeConstrData(1, [data]);
};

export {
  buildAddressData,
  buildCredentialData,
  buildDatumData,
  buildingStakingCredentialData,
  decodeAddressFromData,
  decodeCredentialFromData,
  decodeDatumFromData,
  decodeStakingCredentialFromData,
  makeRedeemerWrapper,
  makeVoidData,
};
