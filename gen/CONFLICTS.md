# Conflicts and the overlay

`gen/ebnf2lezer.mjs` turns each production of the grammar in `spec/` (the extracted table
with `spec/deviations.ebnf` applied) into a Lezer rule, and each terminal into a token. This
file records every conflict Lezer reports for that translation and how it is resolved, and
lists what `gen/overlay.grammar` adds. Checked with @lezer/generator 1.8.1.

## Productions: one conflict

With `shexDoc` as the top rule, Lezer reports one LR conflict:

1. shift/reduce between `Exclusion -> · "." IriExclusion+` (and the other two kinds) and
   `valueSetValue -> Exclusion+`, after an exclusion in a value set with `.` next.
   `valueSetValue*` and its alternative `exclusion+` both repeat exclusions, so
   `[. - <a> . - <b>]` is one value or two; the grammar is ambiguous there.

Resolution: the precedence marker `!exclusion` before the `"."` of `Exclusion` (declared
`@precedence { exclusion @left }`) shifts, so consecutive exclusions form one
`valueSetValue`. As `valueSetValue` is hidden, the tree is the same either way: one
`Exclusion` node per wildcard.

No other production conflicts, so there are no ambiguity markers and no GLR parsing. The
deviations D5 to D7 add none: after `EXTENDS`, `RESTRICTS` or `,` the next token decides.

## Tokens

Lezer requires an order for two tokens that may both come next where one can match a
prefix of what the other matches, unless neither repeats. The generator builds the grammar,
and for each pair Lezer reports puts the token with the longer match first, as one
`@precedence { longer, shorter }` per pair, until Lezer reports none: the longest match, as
in SPARQL 1.1 (`spec/README.md`, "Notation"). The pairs it orders so:

- a prefixed name over a keyword (`BASE` vs `BASE-:x`), over `a`, `true`, `false`, and over
  `PnameNs` (`PnameLn` before all of them);
- `AtpnameLn` over `AtpnameNs` and `@`; `Langtag` over `@`;
- `Double` over `Decimal` over `Integer`, and the numbers over `-` and `.`;
- each language-tagged string over its plain string, and the long strings over the short
  ones they start with (`'''a'''@en` vs `''`).

Lezer orders the other prefix pairs itself, longer first: `StringLiteralLong1` over
`StringLiteral1` and `StringLiteralLong2` over `StringLiteral2` (`'''a'''`, `""""""` vs `''`,
`""`), `RepeatRange` over `{`, `PnameLn` and `PnameNs` over keywords (`BASE:p`, `BASE:`).
`test/lexicon.txt` of the package pins that order.

Tokens that match the same text cannot be ordered by length; the overlay orders them:

- `BlockComment` and `Regexp` both match `/**/` (and `/**/i` is a `Regexp` that starts with a
  `BlockComment`): `@precedence { BlockComment, Regexp }`, as shex.js tries comments first.

## Words

Keywords (letters-only literals of the productions) are tokens named by their text. The
overlay's `@caseInsensitive except "true" "false"` (deviation D8 of `spec/README.md`) makes
each a token of one character class per letter (`$[Bb] $[Aa] $[Ss] $[Ee]`), named by
`@name`, except `true` and `false`, which stay literals. `a` is the terminal `RDF_TYPE` and
matches only as written.

## What the overlay adds

- `@top ShexDoc`, repeating the body of `shexDoc`.
- `@hidden`: the productions that are no nodes, so the tree is not a chain of one-child
  nodes: those that pass one child through (`directive`, `statement`, `shapeExpression`,
  `shapeOrRef`, `xsFacet`, `tripleExpression`, `literal`, ...), the levels of OR, AND and
  NOT for shape expressions (`shapeOr`, `shapeAnd`, `shapeNot`, their inline and extends
  forms), which wrap every shape expression with or without an operator,
  `singleElementGroup`, `unaryTripleExpr`, `valueSetValue`, and `semanticActions`, which
  would be an empty node after most triple constraints.
- `@unused shapeAtomNoRef` (`spec/README.md`, discrepancy 5). An `@unused` production is
  left out; an `@unused` terminal would stay a token, under a second top rule `Unused` that
  no parse starts from, so that its text is an error, as under the longest match (this
  grammar has none).
- `@caseInsensitive` (above).
- The `CodeDecl` rule, which wraps the `"%"` that ends a semantic action without code in an
  inline rule `EmptyCode`, so that the highlighting can tell it from the `"%"` before the
  name.
- The `Exclusion` rule with its precedence marker (above); the generator keeps the comment
  lines right above an overlay rule with the rule.
- `@skip { whitespace | LineComment | BlockComment }`, which names the three alternatives of
  `PASSED TOKENS`.
- In `@tokens`: the order of `BlockComment` and `Regexp`; the brackets as named tokens
  marked with their partners (`closedBy`, `openedBy`), for highlighting, folding, indentation
  and bracket matching; `"." "|" "~" "-" "=" "^^" "$" "&" "%" ";" "," "//"` as named tokens, for
  highlighting.
- The highlighting prop source.
