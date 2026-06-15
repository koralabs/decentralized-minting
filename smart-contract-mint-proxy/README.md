# smart-contract-mint-proxy (FROZEN — do not migrate)

This sub-project exists ONLY to reproduce the on-chain DeMi minting policy.

`demimntprx` compiles (aiken **v1.0.29-alpha**, plutus **v2**) to unapplied hash
`02333b543ae8e19833fb55ce7813b381c731278197bb5f4b8bd51e91`, which applied with the
`version` param yields the on-chain policy `6c32db33a422e0bc2cb535bb850b5a6e9a9572222056d6ddc9cbc26e`.

That hash IS the minting policy id — every DeMi handle is minted under it. It must
NEVER change. So this validator + its lib closure (common/utils, common/hashes,
decentralized_minting/settings) stay pinned to v1.0.29/plutus-v2 here, while the rest
of DeMi (../smart-contract) moves to aiken v1.1.22 / plutus v3. The non-proxy
contracts reference each other (and this policy) through settings at runtime, never
as baked-in params, so they can move independently.

Build: `<v1.0.29-aiken> build` then verify demimntprx hash == 02333b54... above.
