# Changelog

All notable changes to `codemirror-lang-shex` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[semantic versioning](https://semver.org/spec/v2.0.0.html) over what the package exposes:
node names and the exported JavaScript API.

The ShEx specification the grammar was generated from is recorded in `package.json` under
`shex.specification`; it moves when the specification does, not when the package does.

## [Unreleased]

## [0.1.2] - 2026-11-16

### Added

- Tokens `"|"`, `"~"`, `"-"`, `"="`, `"^^"`, `"$"`, `"&"`, `"%"`, `";"`, `","` and `"//"` in
  the tree, highlighted: `|` as a logic operator like `OR`; `~`, `-`, `=` and `^^` as
  operators; `$` and `&` as the triple expression label after them, the `%` before a semantic
  action's name as that name; `;` and `,` as separators; `//` as an annotation.
- `EmptyCode`, the `%` that ends a semantic action without code, not highlighted.

### Changed

- An annotation is no longer highlighted as a whole: its predicate is highlighted as a
  predicate and its object as an IRI or literal.
- `closedBy`/`openedBy` on every bracket, not only those of value sets, so that bracket
  matching follows the tree instead of scanning the text.

## [0.1.1] - 2026-11-16

### Changed

- No changes

## [0.1.0] - 2026-11-16

### Added

- `codemirror-lang-shex`: a CodeMirror 6 language (Lezer parser) for ShExC, generated from
  the grammar of the Shape Expressions Language 2.1 (Final Community Group Report,
  8 October 2019), with highlighting, folding, indentation and keyword completion.
  Deviations from the published grammar: three fixes made upstream after publication (with
  one exclusion kind per wildcard, as shex.js), escapes in regular expressions as in XPath,
  the ShEx 2.next forms that shex.js reads (`ABSTRACT`, `EXTENDS`/`&`, `RESTRICTS`/`-`,
  annotations and semantic actions on node constraints, `,` between triple expressions),
  and keywords in any case.
