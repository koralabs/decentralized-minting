# Contract Deployment Plan

- Plan ID: `de429a1618ad31dd49fe6a1c24c6d9696ff7b8a7a85239faa0bdcfefe7e75851`
- Repo: `decentralized-minting`
- Network: `preview`

## Assigned Handles
- Settings: `demi@handle_settings`
- Settings: `handle_root@handle_settings`
- Settings: `kora@handle_prices`
- Script: `mint_proxy@demi_scripts`
- Script: `mint_data_v1@demi_scripts`
- Script: `mint_v1@demi_scripts`
- Script: `orders@demi_scripts`

## Settings Drift
- `demi@handle_settings.mint_governor`
- `demi@handle_settings.order_script_hash`
- `demi@handle_settings.minting_data_script_hash`

## Contract Drift
- `demimntprx`: `settings_only`
  - Script Hash: `6c32db33a422e0bc2cb535bb850b5a6e9a9572222056d6ddc9cbc26e` -> `6c32db33a422e0bc2cb535bb850b5a6e9a9572222056d6ddc9cbc26e`
  - Handle: `demimntprx1@handlecontract`
- `demimntmpt`: `script_hash_and_settings`
  - Script Hash: `c01540060c07aa7967e7fd8bc42ba8df2fd0ec87f26b80cfcfe7f178` -> `f2c9e3ef2896ee95a0dcf12937338cb6498e4c31a513afcdf38238af`
  - Handle: `demimntmpt4@handlecontract`
- `demimnt`: `script_hash_and_settings`
  - Script Hash: `59a409aae6d8868f2fab827a28f3e34ebffb08c30182f062c313f0bd` -> `5f8cc2b71b60c93a49b7ca09e45cc5913cb465758ce1cb70d4d40201`
  - Handle: `demimnt4@handlecontract`
- `demiord`: `script_hash_and_settings`
  - Script Hash: `f6604607b5a10786b0def29b48ea3bb7f8562953eb3f577a66236e8d` -> `1113f6b2fdbd5dad15d99c17d00052fc84391d723e03c30e950ee673`
  - Handle: `demiord3@handlecontract`

## Transaction Order
- `tx-01.cbor`
- `tx-02.cbor`
- `tx-03.cbor`
- `tx-04-mpt-migration.cbor`
