# How to use De Mi scripts

## Description

This is Ada Handles' Decentralized Minting Smart contracts and its Off chain SDK.

## Project structure

```bash
decentralized-minting
│
├───scripts
│       De Mi Interactive CLI
│
├───smart-contract
│       Decentralized Minting Smart contract in Aiken
|
├───src
│       Off chain SDK in Typescript
|
```

## How to use De Mi Interactive CLI

### Set up configuration files

You need to set up configuration variables.

- `MINT_VERSION`: The version of the minting policy.

- `LEGACY_POLICY_ID`: The policy ID of the legacy minting policy.

`"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"`

- `GOD_VERIFICATION_KEY_HASH`: The verification key hash of the god role.

This GOD Role is used in Minting Data smart contract.

- `SETTINGS_ASSET_CLASS`: The asset class of the settings.

`"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de14064656d694068616e646c655f73657474696e6773"`

This is Legacy handle `demi@handle_settings`

- `MINTING_DATA_ASSET_CLASS`: The asset class of the minting data.

`"f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a.000de14068616e646c65735f726f6f744068616e646c655f73657474696e6773"`

This is Legacy Handle `handles_root@handle_settings`

- `ALLOWED_MINTERS`: The list of allowed minters.

Verification Keys who are allowed to mint handles.

- `TREASURY_ADDRESS`: The address of the treasury.

Treasury address is use to collect fee

- `PZ_SCRIPT_ADDRESS`: The address of the personalization script.

Reference Handle Asset must be sent to PZ script.

- `TREASURY_FEE`: The fee of the treasury.

- `MINTER_FEE`: The fee of the minter.

### Deploy Smart contracts

- Start De-Mi CLI

```bash
npm run start # start:preview | start:preprod
```

- Pick actions

`on-chain` -> `deploy` -> select contract to deploy

- Regisiter Staking Addresses

`on-chain` -> `staking-addresses` -> select contract to register
