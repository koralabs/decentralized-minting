# Aiken Cost Baseline & Optimization Step

On-chain scripts cost real currency to deploy and execute, and Conway caps a single
validator at **16,384 bytes**. Mem/CPU ex-units are metered per tx and paid in fees. So
**every contract-editing cycle must include a size + mem/CPU measurement step** and must
not regress without reason. This mirrors the discipline used in `handles-personalization`
(`docs/spec/aiken-cost-baseline.md`, `aiken-compiler-constraints.md`, `tests/aiken.cost.test.js`).

## Toolchain (pinned)

- Compiler: **aiken v1.0.29-alpha** (`plutus = "v2"`). The PATH `aiken` (v1.1.21) is
  Plutus-V3-only and will not load this project — use the pinned binary:
  `~/.aiken/versions/v1.0.29-alpha/aiken-x86_64-unknown-linux-gnu/aiken`.
- MPT library: **aiken-lang/merkle-patricia-forestry v1.2.0** — includes all proof-
  verification/root fixes (v1.1.1 leaf-fork, v1.1.2 terminal-fork, v1.2.0 non-empty-prefix
  forks) plus the `miss` non-membership proof.

## Measure (run every contract-editing cycle)

```sh
AIKEN=~/.aiken/versions/v1.0.29-alpha/aiken-x86_64-unknown-linux-gnu/aiken
# byte size per validator (Conway limit 16384)
$AIKEN build --trace-level silent
node -e "const d=require('./plutus.json'); for(const v of d.validators){console.log((v.compiledCode.length/2).toString().padStart(6),v.title)}"
# mem/cpu per test + correctness
$AIKEN check
```

## Validator byte-size baseline

Snapshot after WS2 (`BurnLegacyHandles` redeemer). Limit 16,384 B per validator.

| Validator | Bytes | % of limit |
| --- | --- | --- |
| `demimntmpt.spend` | 7,426 | 45% |
| `demiord.spend` | 1,960 | 12% |
| `demimntprx.mint` | 747 | 5% |
| `demimnt.withdraw` | 725 | 4% |

`demimntmpt` holds almost all logic (orders, MPT, mint/burn) and is the one to watch as
WS1 (`MintLabelAssets`) lands. ~9 KB of headroom; if it approaches the limit, split by
redeemer into dedicated validators (the pz playbook — see below).

## Optimization techniques (from the pz contracts)

Apply when a change grows size or ex-units:

- **Prefer arithmetic over expensive builtins** — e.g. ASCII-range checks instead of
  `bytearray.index_of` over an alphabet (pz base58: −90% mem).
- **Defer allocations** — only `concat`/build values inside the branch that uses them.
- **Lean positional parsers** — parse only the datum fields a given validator needs.
- **Cache parsed/looked-up values** — bind once, reuse; don't re-resolve.
- **`list.has` over `list.any(fn == h)`** for membership; flatten nested `Option`/tuple.
- **Tree-shake by redeemer** — split a monolithic validator so each redeemer's branch
  compiles alone (each unused arm `-> False`; Aiken DCE strips it). This is how pz got
  `perspz` 20.3 KB → 13.5 KB and fit the 16 KB cap.
- **Keep test-only records `pub`** so DCE strips them from production binaries.

## Regression guard (TODO as real-flow tests land)

Add a `tests/aiken.cost.test.*` that parses `aiken check` JSON and asserts per-test
mem/cpu ceilings, like `handles-personalization/tests/aiken.cost.test.js`. The current
DeMi tests are pure-function only; the meaningful mint/burn ex-unit numbers come from the
off-chain engine round-trip (real MPT proofs), which is where ceilings should be enforced.
