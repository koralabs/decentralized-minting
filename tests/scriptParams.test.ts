import { describe, expect, it } from "vitest";

import optimizedBlueprint from "../src/contracts/optimized-blueprint.js";
import {
  applyParamsToScript,
  type PlutusDataJson,
  plutusV2ScriptHash,
  plutusV3ScriptHash,
} from "../src/helpers/cardano-sdk/scriptParams.js";

// Pinned applied (parameterized) validator hashes — a regression lock on
// scalus's `applyParamsToScript` against the committed blueprint.
//
// Plutus-version split (aiken v1.1.22 migration):
//   - demimntprx (mint proxy) is FROZEN at Plutus V2 (aiken v1.0.29-alpha).
//     Its compiled code and applied hash are unchanged from the helios era.
//   - demimnt (withdraw) and demimntmpt (spend) are now Plutus V3
//     (aiken v1.1.22). Their compiled code AND the language tag changed, so
//     the applied hashes moved and they must be hashed with plutusV3ScriptHash.
const PINNED_HASHES = {
  // demimntprx — Plutus V2, unchanged across the v3 migration.
  mintProxyIntV1: "c4d3329ac42cd35626f74d451a54b2d1ba1f9f380c9f88e3e7a9585b",
  // demimnt.withdraw — Plutus V3 applied hash (aiken v1.1.22 build).
  mintV1WithdrawBytesA56: "342bbb9cf450e63ad336ad6c65b1cb55aaa4cc7f097fb6738908c7fe",
  // demimntmpt.spend — Plutus V3 applied hash with the 5 params
  // (legacy_policy_id, admin_vkh + WS7 slot anchor: anchor_slot,
  // anchor_time_ms, slot_length_ms), aiken v1.1.22 build.
  mintingDataSpend5Params:
    "dc4efa43b2c4652c064ced9897589f77b557a7fbaae31f991797e1d1",
};

const findValidator = (title: string) => {
  const validator = optimizedBlueprint.validators.find(
    (v) => v.title === title,
  );
  if (!validator) throw new Error(`validator ${title} not in blueprint`);
  return validator.compiledCode;
};

describe("applyParamsToScript (scalus)", () => {
  it("matches the pinned V2 hash for the (frozen) mint proxy with an int param", () => {
    const compiledCode = findValidator("demimntprx.mint");
    // demimntprx stays Plutus V2 — hash with the V2 helper.
    const hash = plutusV2ScriptHash(
      applyParamsToScript(compiledCode, [{ int: 1 } as PlutusDataJson]),
    );
    expect(hash).toBe(PINNED_HASHES.mintProxyIntV1);
  });

  it("matches the pinned V3 hash for mint v1 withdraw with a bytes param", () => {
    const compiledCode = findValidator("demimnt.withdraw");
    // demimnt is Plutus V3 (aiken v1.1.22) — hash with the V3 helper.
    const hash = plutusV3ScriptHash(
      applyParamsToScript(compiledCode, [
        { bytes: "a".repeat(56) } as PlutusDataJson,
      ]),
    );
    expect(hash).toBe(PINNED_HASHES.mintV1WithdrawBytesA56);
  });

  it("matches the pinned V3 hash for minting data spend with its 5 params (2 bytes + 3 ints)", () => {
    const compiledCode = findValidator("demimntmpt.spend");
    // demimntmpt is Plutus V3 (aiken v1.1.22) — hash with the V3 helper.
    const hash = plutusV3ScriptHash(
      applyParamsToScript(compiledCode, [
        { bytes: "b".repeat(56) } as PlutusDataJson,
        { bytes: "c".repeat(56) } as PlutusDataJson,
        { int: 1 } as PlutusDataJson,
        { int: 2 } as PlutusDataJson,
        { int: 3 } as PlutusDataJson,
      ]),
    );
    expect(hash).toBe(PINNED_HASHES.mintingDataSpend5Params);
  });
});

describe("plutusV3ScriptHash vs plutusV2ScriptHash (Plutus version-tag bug)", () => {
  // The real handles-personalization persprx (LBL_100 personalization proxy).
  // It is a PlutusV3 contract. A 2026-06-04 deploy session hashed it with this
  // repo's V2-only `plutusV2ScriptHash` and wrote the resulting PlutusV2 hash
  // (fd517730) into the DeMi settings' pz_script_address — a phantom that was
  // never deployed (Blockfrost 404), stranding every DeMi sub's 000/100 ref.
  // The script hash is blake2b224(version_byte || cbor), so the SAME cbor under
  // V2 vs V3 yields different hashes. Hash cross-repo pz contracts (V3) with
  // plutusV3ScriptHash; hash this repo's DeMi contracts (V2) with the V2 helper.
  const PERSPRX_V3_COMPILED_CODE =
    "5903f201010029800aba2aba1aba0aab9faab9eaab9dab9a488888896600264653001300830090019b874800a60100049112cc004c008c01cdd5001c6600260106ea800e46018601a0032232330010010032259800800c52845660026006601e00314a313300200230100014028806a6e9520004888a6002601e009300f3010004992cc004c01cc030dd5000c5300103d87a8000899192cc004cdc3a4008601c6ea80062646464646464653001301a001980c980b1baa301930163754601a602c6ea8026603200f3019006980c802cc064012603200491111112cc004c05cc070dd5003456600266e3cdd71810180e9baa006375c604001113232330010010022259800800c4c054cc088dd3801a5eb8226466006006604a0046eb8c08c0050211bac302000a8a6103d87a8000406d14c103d87a8000406c30190013018001301700130160013015001301400137586024601e6ea80062980103d87a80004034602260246024601c6ea8c014c038dd5000980818069baa001402c64660020026eb0c010c034dd5003112cc004006298103d87a80008992cc004c024c9660026014601e6ea80062900044dd6980998081baa001403864b3001300a300f375400314c103d87a8000899198008009bab30143011375400444b30010018a6103d87a8000899192cc004cdc8a450f000de140707a5f73657474696e6773000018acc004cdc7a4410f000de140707a5f73657474696e677300001898049980b180a00125eb82298103d87a80004049133004004301800340486eb8c048004c054005013201c32330010013756600e60206ea8c01cc040dd5001112cc004006298103d87a8000899192cc004cdc8a451cf0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a000018acc004cdc7a4411cf0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a00001898041980a980980125eb82298103d87a80004045133004004301700340446eb8c044004c05000501244c010cc0440052f5c1133003003301300240346022002807922259800980498071baa0018a5089991198039bab3014301530153015301530153015301530153015301137540144b30013375e60240020051325980099b8748010c048dd5000c4c966002b3001300e3013375400313232330010010072259800800c528456600266e3cdd7180d000801c528c4cc008008c06c0050152030375c602e60286ea8006294101244cc028dd5980b980c180c180c180c180c180c180a1baa00d25980099baf3014001002899b8748000dd6980a800c52820268a504048602c60266ea800629410111808800c528202037586024601e6ea8004c010cc04400ccc044c04802d2f5c080688b200c180400098019baa0088a4d1365640041";
  const PERSPRX_V2_PHANTOM =
    "fd517730c0d5b52dc5e0bf5f05c40545cc4a7a052f0513f7cf89befb";
  const PERSPRX_V3_ONCHAIN =
    "7cf105586f77934a524c9e78f8879a33460104f9578e9ac927f577e3";

  it("hashing the V3 persprx as V2 reproduces the phantom fd517730 (the bug)", () => {
    expect(plutusV2ScriptHash(PERSPRX_V3_COMPILED_CODE)).toBe(PERSPRX_V2_PHANTOM);
  });

  it("hashing the V3 persprx as V3 gives the real on-chain 7cf10558 (the fix)", () => {
    expect(plutusV3ScriptHash(PERSPRX_V3_COMPILED_CODE)).toBe(PERSPRX_V3_ONCHAIN);
  });

  it("V2 and V3 hashes of the same cbor differ", () => {
    expect(plutusV2ScriptHash(PERSPRX_V3_COMPILED_CODE)).not.toBe(
      plutusV3ScriptHash(PERSPRX_V3_COMPILED_CODE),
    );
  });
});
