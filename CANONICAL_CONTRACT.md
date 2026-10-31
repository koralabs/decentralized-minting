# decentralized-minting canonical contract

## Purpose and authority

I am the on-chain program that decides which handles can exist. The minting-data UTxO holds one Merkle Patricia Trie root of every minted handle; that root is what makes a double-mint impossible. I serve minting.handle.me and hal-minting-engine. My protected files are listed in [`.enclave`](./.enclave). Tests, builders and scripts are not protected files, but they never carry authority to sign or spend.

## Invariants that must never be violated

1. A handle key enters the trie root at most once. A mint under the policy is valid only when `demimntmpt` spends the minting-data UTxO and `tx.mint` equals exactly the proven keys (`demimntprx` then `demimnt` then `demimntmpt`). Enforced by Aiken tests under `smart-contract/lib/tests/validations/minting_data/` (`mint_demi`, `legacy_mint`, `burn_new`).
2. The proxy hash and policy id are frozen. `demimntprx` never changes; logic moves only by swapping governors in settings. Not enforced by a test in this repo.
3. The trie root changes only inside a mint or burn transaction, or the admin-signed, mint-nothing `UpdateMPT` a human runs by hand. No automated root sync. The off-chain trie is rebuilt from the API every time and compared with the on-chain root, with no disk cache. Enforced on chain by `update_mpt.test.ak`; the no-cache rule is enforced by `tests/store.unit.test.ts`.
4. An order is consumed only when a mint happens, refunds pay at least the order lovelace to the owner credential, and cancel needs the owner. Enforced by `lib/tests/validations/orders/validation.test.ak` and `tests/orderProofs.test.ts`.
5. Reference tokens go to `settings_v1.pz_script_address`, user tokens to the order destination, fees as priced. Enforced by `mint_v1.test.ak`, `owner_fees.test.ak`, `handle_price.test.ak`.
6. Burns happen only through the burn paths and keep the labelled-root rules (`labeled_root_burn.test.ak`, `tests/burnProofs.test.ts`). The planned protections (label-burn policy, empty-registry guard on key delete, orphan path) in `docs/spec/contract-protections.md` are not enforced yet, so their tests are missing.

## Boundaries and known limits

Deployment plans and transactions (`src/deploymentPlan.ts`, `src/deploymentTx.ts`, `deploy/<network>/`) are ordinary reviewed code; nothing in them refuses a non-preview signature by an agent. That rule rests on the multisig only.

## Refactors needed to enforce this

- Add a test that pins the `demimntprx` compiled hash.
- Make the deploy plan refuse an agent signature outside preview (plan row 4.7).
- Land the planned protections in `contract-protections.md` with their must-never-happen tests.
- Split Aiken test blocks from production files so test-only edits do not ask for approval.
## Authority and limits that apply to everything here

- Higher-risk and operator-approved only: any edit to an on-chain validator or to settings (settings handles, policy roots, `pers*@handle_settings` and handlecontract datums), anything that could double-mint, and any automated burn.
- I may sign for preview only. Preprod and mainnet always need humans on the multisig. Nothing in this repo authorises secret access, signing or spending by an agent.
- The `.enclave` lists only the on-chain source and these two files. It is path-only: a test-only change inside a listed file still asks for approval.
