# How to deploy contracts and establish system

## Assets used in smart contracts

There are 2 assets, `settings_asset`, `minting_data_asset` used in smart contracts.

These assets are used in smart contracts and their information (policy id, asset name) are saved inside the smart contracts code.

So in off chain side, we must use same one.

- `settings_asset_policy_id`: This is policy id of settings asset

- `settings_asset_name`: This is asset name of settings asset

  NOTE: includes asset name label

- `minting_data_asset_policy_id`: This is policy id of minting data asset

- `minting_data_asset_name`: This is asset name of minting data asset

  NOTE: includes asset name label

## Settings used in smart contracts

The settings are attached to `settings_asset` as datum.

## Deploy Contracts

### Be sure to update contracts' compiled code

- Run these commands under `/smart-contract` folder

  This will make `plutus.json` which contains all smart contracts compiled code. (also called `blueprints`)

  ```bash
  aiken build # for optimized blueprints

  aiken build -t verbose # for unoptimized blueprints
  ```

- Check `blueprints` are same as the ones under `/src/contracts/*-blueprints.ts`

  `*-blueprints.ts` is simply `default export`ing `blueprints` from `plutus.json`
