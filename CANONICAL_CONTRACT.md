# decentralized-minting canonical contract

On-chain program (Aiken) deciding which handles can exist. The minting-data UTxO holds one Merkle Patricia Trie root of every minted handle. It serves minting.handle.me and hal-minting-engine.

1. A handle key enters the trie root at most once: a mint is valid only when `demimntmpt` spends the minting-data UTxO and `tx.mint` equals exactly the proven keys (`demimntprx` then `demimnt` then `demimntmpt`).
2. The proxy hash and policy id are frozen: `demimntprx` never changes; logic moves only by swapping governors in settings.
3. The trie root changes only inside a mint or burn transaction, or the admin-signed, mint-nothing `UpdateMPT`.
4. An order is consumed only when a mint happens; refunds pay at least the order lovelace to the owner credential; cancel needs the owner.
5. Reference tokens go to `settings_v1.pz_script_address`, user tokens to the order destination, fees as priced.
6. Burns happen only through the burn paths and keep the labelled-root rules.
