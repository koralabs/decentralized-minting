// Thin re-export shim: the address/credential/datum builders now live in
// `./plutusData.ts`. This file is kept for backwards-compat with existing
// import paths inside the package.

export {
  buildAddressData,
  buildCredentialData,
  buildOptionalStakingCredentialData as buildingStakingCredentialData,
  decodeAddressFromData,
  decodeCredentialFromData,
  decodeOptionalStakingCredentialFromData as decodeStakingCredentialFromData,
  mkBool as makeBoolData,
  mkRedeemerWrapper as makeRedeemerWrapper,
  mkUnit as makeVoidData,
} from "./plutusData.js";
