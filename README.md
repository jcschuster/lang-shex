# lang-shex

Editor language support for [ShEx](https://shex.io) 2.1, the compact syntax (ShExC) of the
Shape Expressions Language: [`codemirror-lang-shex`](packages/codemirror-lang-shex), a
CodeMirror 6 language whose Lezer grammar is generated from the ShExC grammar table of the
specification. Changes are in [CHANGELOG.md](CHANGELOG.md).

## Layout

- `spec/`: the grammar extracted from the specification (`shex-2.1.ebnf`), the deviations
  from it (`deviations.ebnf`), its notation and the discrepancies found in it
  (`README.md`), and the pinned specification (`SOURCE`).
- `gen/`: `fetch.mjs` extracts the grammar from the specification's page; `ebnf2lezer.mjs`
  writes the Lezer grammar from `spec/` and `overlay.grammar`; `CONFLICTS.md` explains the
  overlay. `node --test gen/` tests both.
- `fixtures/shexTest/`: the `.shex` files of the ShEx test suite (schemas, negative syntax
  and negative structure tests) at the commit `SOURCE` pins, with the suite's `LICENSE`.
- `packages/codemirror-lang-shex/`: the package.

## Working on it

The devshell (`nix develop`, or direnv) has every tool. Then:

```sh
pnpm install
pnpm generate                  # writes the grammar and src/words.ts
.github/scripts/test-all.sh    # every check CI runs
```

Generated files are committed, and `pnpm generate` leaves a clean tree. `node gen/fetch.mjs`
downloads the pinned specification, checks its sha256 and rewrites `spec/shex-2.1.ebnf`.
`.github/scripts/fetch-fixtures.sh` replaces `fixtures/shexTest/` from the pinned commit of
shexTest and records the files' sha256, which `test-all.sh` checks. `.github/scripts/check-fixtures.sh` parses the fixtures with shex.js
(`@shexjs/parser`) and fails where it does not accept or reject them as the suite expects.

A new specification is worked into `spec/` by hand: `reference.yml` checks shex.io every
Sunday and opens an issue when it serves a specification other than the one `spec/SOURCE`
pins, or when `gen/fetch.mjs` no longer writes `spec/shex-2.1.ebnf` as committed from the
pinned one.

## Releasing

A release is a merged pull request labelled `release`: `release.yml` then publishes the
package to npm and creates the GitHub release `vX.Y.Z`, using the version's CHANGELOG
section as release notes. To make one, run `.github/scripts/version.sh X.Y.Z`, add a
`## [X.Y.Z] - date` section to `CHANGELOG.md`, open a pull request and label it `release`.

## Licence

MIT; see [LICENSE](LICENSE). The grammar is derived from the Shape Expressions Language 2.1
specification, and the fixtures are copied from the ShEx test suite; see [NOTICE](NOTICE).
