# Update Scripts

## When update `minting_data` spending script

1. Run `deploy` command

This will return json.

The `scriptAddress` is the address of the new `minting_data` script.

2. Spend `handle_root@handle_settings` from old `minting_data` script and send that to new `minting_data` script

- Must attach correct MPT root hash to `handle_root@handle_settings`

3. Deploy new `minting_data` script

- Update script attached to `mint_data_v1@demi_scripts` handle

Spend that handle from multisig wallet and send it again with updated reference script.

4. Update demi settings datum

- Run `settings` script to get new settings datum cbor

- Update settings attached to `demi@handle_settings`

- Spend `demi@handle_settings` from multisig wallet and sent it again with updated datum
