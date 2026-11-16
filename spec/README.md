# spec

The ShExC grammar of the Shape Expressions Language 2.1, extracted from the specification
recorded in `SOURCE`, and the deviations from it. The generator in `gen/` reads these files;
nothing else in the repository is a source of grammar facts.

- `shex-2.1.ebnf`: the grammar table of section 6 (`<section id="shexc">`), written by
  `gen/fetch.mjs`: one production per table row, with its number, name and right-hand side as
  the page renders them. Not edited by hand.
- `deviations.ebnf`: hand-written productions that replace the extracted production of
  their name, or add one, each under a comment naming its item in "Deviations" below.
- `SOURCE`: URL, release, status, sha256, fetch date and source commit of the specification;
  `section` and `grammar` tell `gen/fetch.mjs` what to extract and where to write it.

The HTML page is not in the repository. `node gen/fetch.mjs` downloads it from the URL in
`SOURCE`, refuses it unless its sha256 is the pinned one, and writes `shex-2.1.ebnf`; `node
gen/fetch.mjs page.html` reads a saved copy instead.

## Extraction

The grammar table is a `<table>` in `<div class="grammarTable">`, with interleaved rows that
show the ShExJ objects a production yields and explanatory paragraphs. `gen/fetch.mjs` takes
the rows of four cells whose first cell has the id `prod-NAME` or `term-NAME` (the number is
in its `span.prodNo`; the second cell holds the name, the fourth the right-hand side). HTML
comments are removed first, so the rows are the rendered ones. Cell text: `<br>` is a line
break, tags are dropped, entities decoded, no-break spaces read as spaces, each line trimmed.

## Notation

The specification states that its grammar follows the notation of the XML specification
(EBNF, XML 1.0 section 6). The files here keep it as printed, with these readings, which are
where the grammar departs from XML's notation or where XML's notation leaves a choice:

| Form | Meaning |
|---|---|
| `[n] name ::= rhs` | a production; `[n]` is the specification's number (`[4½]`, `[13t]`, `[134s]`; `[]` for none). Lines starting with whitespace continue the right-hand side. Lines starting with `#` are comments. |
| `<NAME> ::= ...` | a terminal: a token. `PASSED TOKENS` (whitespace and comments, which may appear between any tokens) is a terminal too. Every other production is a nonterminal. |
| `'...'`, `"..."` | a literal string. Unlike XML, a backslash escapes: `\n`, `\r`, `\t` are line feed, carriage return and tab, a backslash before any other character is that character (`"\\u"` is a backslash and `u`, `\"` a quote). |
| `[...]`, `[^...]` | a character class, or any character not in it, with ranges `a-z`. Characters as in strings, or as `#xHEX` or, unlike XML, `#HEX` without the `x` (`[#00C0-#00D6]`). A `-` before `]` is itself. `[^...]` matches any code point outside the class, also those XML's `Char` excludes. |
| `A B`, `A \| B`, `( )` | sequence, alternative, grouping |
| `A?`, `A*`, `A+` | optional, zero or more, one or more; whitespace may stand before the operator (`) +`, as shexSpec/spec d1d5e1bd writes it). |

XML's `A - B` (difference) does not occur and is rejected.

The specification does not state how input is split into tokens. The generator uses the
longest match, as the SPARQL 1.1 grammar it restates does, except that a comment wins over a
regular expression of the same text (`/**/`; `gen/CONFLICTS.md`).

## Discrepancies in the source

Found while extracting and testing. Items marked **deviation** are changed by
`deviations.ebnf` or the overlay (`gen/overlay.grammar`), under the number given there.

1. `exclusion ::= '.' '-' (iri | literal | LANGTAG) '~'?` [50] allows one exclusion per
   wildcard, so `[. - <v1> - <v2>]`, as in the specification's own examples and shexTest,
   does not parse. Fixed in shexSpec/spec `d1d5e1bd` (PR #59, 2023), on its gh-pages but
   never republished, as `'.' (iriExclusion | literalExclusion | languageExclusion) +`.
   **Deviation D1**, decided by Johannes 2026-11-16: `'.' (iriExclusion+ |
   literalExclusion+ | languageExclusion+)`, as shex.js and shexSpec/grammar's `ShExDoc.g4`
   have it, which differs from `d1d5e1bd`: the exclusions after one wildcard are of one
   kind, so `[. - <a> - 'x']` is an error. ShExJ cannot represent a stem range with
   exclusions of mixed kinds, and shex.js and `ShExDoc.g4` reject one.
2. `iriRange ::= iri ('~' exclusion*)?` [51] takes `exclusion`, not `iriExclusion`, unlike
   `literalRange` and `languageRange`. Fixed in shexSpec/spec `c246fc44` (PR #31).
   **Deviation D2**, decided by Johannes 2026-11-16: the fixed rule.
3. `PN_LOCAL` [77] lets a prefixed name end in `.`, unlike SPARQL 1.1 and Turtle, so `ex:p.`
   would swallow a statement's final dot. Fixed in shexSpec/spec `df3e3996` (PR #32).
   **Deviation D3**, decided by Johannes 2026-11-16: the fixed rule, as in SPARQL and Turtle.
4. `REGEXP` [72] has the class `[nrt\\|.?*+(){}$-\[\]^/]`, where `$-\[` is, in XML's notation,
   the range from `$` to `[`, which would allow escapes such as `\A` or `\1`. The XPath 3.1
   escapes that the specification refers to for pattern facets have `$`, `-` and `[` each,
   and shex.js reads the class so.
   **Deviation D4**, decided by Johannes 2026-11-16: the three characters; `\-` in `deviations.ebnf`.
5. `shapeAtomNoRef` [19] is defined and used by no production. Kept out of the grammar
   (`@unused` in the overlay).
6. The numbering skips [39] and mixes plain numbers with `½` and the suffixes `t` and `s`
   (productions restated from Turtle and SPARQL 1.1); `PASSED TOKENS` is [98]. Kept as is.
7. The block comment of `PASSED TOKENS` [98], `"/*" ([^*] | '*' ([^/] | '\\/'))* "*/"`,
   rejects a comment that ends in more than one star (`/* a **/`); shex.js does the same.
   Kept as is.
8. The case of keywords is not specified. shex.js matches every keyword in any case except
   `true` and `false` (and `a`, a terminal), and except `NOT`: its rule `[No][Oo][Tt]` takes
   an upper-case `N` or an `o` first, so `not` is no keyword in shex.js (and `oot` is one).
   **Deviation D8**, decided by Johannes 2026-11-16: as shex.js (`@caseInsensitive` in the
   overlay), with `NOT` in any case like the other keywords: `not` is `NOT` here, `oot` is
   no keyword.
9. ShEx 2.next syntax, which no published release has: `ABSTRACT`, `RESTRICTS` or `-`
   before a shape, `EXTENDS` or `&` in a shape's qualifiers. It is in shex.js's grammar
   (`ShExJison.jison`) and shexSpec/grammar's `ShExDoc.g4`, and 25 schemas of shexTest use
   it. **Deviation D5**, decided by Johannes 2026-11-16: as shex.js parses it.
10. Two more forms of shex.js that schemas of shexTest use, taken under the decision on D5
    (all of shexTest's `schemas/` parses): annotations and semantic actions on a node
    constraint outside a triple constraint (`2val1refvsAnnot`, `2val1refvsCode`; shex.js
    splits each node constraint into an inline form without them, as **deviation D6**
    does), and `,` as a separator of triple expressions (`schemas/allSome/`, 24 files that
    no manifest lists; **deviation D7**). Both decided by Johannes 2026-11-16. `start =`
    takes an inline shape expression here, as in the specification (`start` [6]), so
    annotations and semantic actions after `start = …` are errors here (`start = IRI // <p>
    1`, `start = <S> %<x>{ %}`), while shex.js accepts them after a node constraint.
11. `numericFacet` [30] takes a `numericLiteral`; shex.js also takes a string with a
    datatype and rejects it later, so for shex.js four tests of `negativeSyntax/`
    (`1*Mininclusiveroman-numeral`) fail outside the grammar. Here they are syntax errors.
    Kept as is.
12. shexTest's `negativeStructure/includeWithCardinality` and `includeWithLabel` put an
    inclusion in parentheses with a cardinality or a label. The grammar derives both; shex.js
    rejects them while building ShExJ, where an inclusion is a bare label. Kept as is, decided
    by Johannes 2026-11-16: here they parse.

## How the generator reads these files

`gen/ebnf2lezer.mjs` (details and conflicts: `gen/CONFLICTS.md`):

- Each nonterminal becomes a rule named in CamelCase (`shapeExprDecl` -> `ShapeExprDecl`),
  except those the overlay lists as `@hidden`, which keep their name and are no nodes.
- Each terminal named in a production becomes a token named in CamelCase (`IRIREF` ->
  `Iriref`, `PNAME_LN` -> `PnameLn`); terminals only other terminals use (`UCHAR`, `PN_CHARS`)
  become hidden token rules (`uchar`, `pnChars`). The alternatives of `PASSED TOKENS` are the
  skip tokens `whitespace`, `LineComment` and `BlockComment`.
- A literal of letters in a production is a keyword: a token named by its text (`BASE`,
  `start`), matched in any case where the overlay says so.
- Undefined names are errors, and so is a production no top rule reaches, unless the overlay
  lists it as `@unused`; an `@unused` terminal would stay a token that no rule accepts
  (`gen/CONFLICTS.md`).

## Redistribution

The specification is published under the W3C Community Contributor License Agreement, which
permits derivative works and asks for an attribution naming the specification and its
version (section 2.2); `NOTICE` gives it. The productions restated from SPARQL 1.1 and Turtle
fall under the W3C Document License, which permits derivative works in software with its
notice, also in `NOTICE`. The extracted file holds the grammar table and nothing else of the
page.
