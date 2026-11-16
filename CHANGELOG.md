# Changelog

All notable changes to `codemirror-lang-shex` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[semantic versioning](https://semver.org/spec/v2.0.0.html) over what the package exposes:
node names and the exported JavaScript API.

The ShEx specification the grammar was generated from is recorded in `package.json` under
`shex.specification`; it moves when the specification does, not when the package does.

## [Unreleased]

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
