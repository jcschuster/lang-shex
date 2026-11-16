// Writes the files of `outputs`: the package's Lezer grammar, from the grammar in spec/ (the
// extracted table and spec/deviations.ebnf, read by ebnf.mjs) and gen/overlay.grammar, and,
// where `outputs` names it, src/words.ts (for completion) with the keywords of the
// productions. Notation: spec/README.md. What the overlay adds, and the conflicts:
// gen/CONFLICTS.md.
import {readFileSync, writeFileSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {buildParser} from "@lezer/generator"
import {readSpec, references, literals} from "./ebnf.mjs"
import {wholeRegExp} from "./regex.mjs"

const isWord = text => /^[A-Za-z]+$/.test(text)
// IRIREF -> Iriref, PN_CHARS_U -> PnCharsU; shapeExpr -> ShapeExpr.
export const pascal = name =>
  /^[A-Z0-9_]+$/.test(name)
    ? name.toLowerCase().replace(/(^|_)([a-z0-9])/g, (_, __, c) => c.toUpperCase())
    : name.replace(/^./, c => c.toUpperCase())
const camel = name => pascal(name).replace(/^./, c => c.toLowerCase())
const normalize = text => text.replace(/[!~]\w+/g, "").replace(/\b[A-Z]\w*\s*\{([^{}]*)\}/g, "$1").replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim()

/// The rules defined in Lezer text, each starting a line: {name, top, props, body, comment,
/// from, to}, where `comment` holds the `//` lines right above the rule, and `from` is where
/// they start. Braces in strings do not count; those in comments do.
export function lezerRules(text) {
  const rules = []
  const head = /^((?:\/\/.*\n)*)(@top\s+)?([A-Za-z_]\w*)(\[[^\]]*\])?(<[^>]*>)?\s*\{/gm
  for (let m; (m = head.exec(text)); ) {
    const end = closingBrace(text, head.lastIndex)
    rules.push({name: m[3], top: !!m[2], props: m[4] ?? "", body: text.slice(head.lastIndex, end), comment: m[1], from: m.index, to: end + 1})
    head.lastIndex = end + 1
  }
  return rules
}

/// The overlay lines meant for the generator, each at the start of a line:
/// `@hidden name ...`, `@unused name ...` and `@caseInsensitive [except "word" ...]`, and the
/// overlay without them and the comment lines right above them.
export function directives(overlay) {
  const found = {hidden: new Set(), unused: new Set(), caseInsensitive: null}
  const rest = overlay.replace(/^(?:\/\/.*\n)*@(hidden|unused|caseInsensitive)\b(.*)$/gm, (_, name, args) => {
    if (name != "caseInsensitive") for (const n of args.trim().split(/\s+/)) found[name].add(n)
    else {
      const m = /^\s*(?:except((?:\s+"[^"]*")+))?\s*$/.exec(args)
      if (!m) throw new Error(`gen/overlay.grammar: cannot read @caseInsensitive${args}`)
      found.caseInsensitive = new Set(m[1] ? [...m[1].matchAll(/"([^"]*)"/g)].map(x => x[1]) : [])
    }
    return ""
  })
  return {...found, rest}
}

export function generate(grammar, overlayText) {
  const {hidden, unused, caseInsensitive, rest: overlay} = directives(overlayText)
  const overlayRules = lezerRules(overlay)

  for (const [name, {expr}] of grammar)
    for (const ref of references(expr)) if (!grammar.has(ref)) throw new Error(`${name} refers to ${ref}, which is not defined`)
  const productions = [...grammar].filter(([, p]) => !p.terminal).map(([name]) => name)

  const notProductions = [...hidden].filter(name => !productions.includes(name))
  if (notProductions.length) throw new Error(`@hidden names what is not a production: ${notProductions.join(" ")}`)
  const ruleName = name => (hidden.has(name) ? name : pascal(name))
  const byRule = new Map(productions.map(name => [ruleName(name), name]))
  const tops = overlayRules.filter(rule => rule.top).map(rule => byRule.get(rule.name))
  if (!tops.length || tops.includes(undefined)) throw new Error("gen/overlay.grammar: every @top must be a production")

  // What the tops reach.
  const reached = new Set()
  const reach = name => {
    if (reached.has(name)) return
    reached.add(name)
    for (const ref of references(grammar.get(name).expr)) reach(ref)
  }
  tops.forEach(reach)
  if (grammar.has("PASSED TOKENS")) reach("PASSED TOKENS")
  const unreached = [...grammar.keys()].filter(name => !reached.has(name) && !unused.has(name))
  if (unreached.length) throw new Error(`unused productions: ${unreached.join(" ")}`)
  const wrongUnused = [...unused].filter(name => !grammar.has(name) || reached.has(name))
  if (wrongUnused.length) throw new Error(`@unused names productions that are used or undefined: ${[...wrongUnused].join(" ")}`)
  // An unused terminal is still a token, as the specification splits text into the longest
  // match of any terminal: no rule accepts it, so its text is an error.
  const unusedTerminals = [...unused].filter(name => grammar.get(name).terminal)
  unusedTerminals.forEach(reach)

  // Terminals named in productions are tokens of the tree; the others only help define them.
  const reachedProductions = productions.filter(name => reached.has(name))
  const terminals = [...grammar.keys()].filter(name => reached.has(name) && grammar.get(name).terminal && name != "PASSED TOKENS")
  const named = new Set([...reachedProductions.flatMap(name => [...references(grammar.get(name).expr)]).filter(ref => grammar.get(ref).terminal), ...unusedTerminals])
  const tokenName = name => (named.has(name) ? pascal(name) : camel(name))
  const emitted = [...reachedProductions.map(ruleName), ...terminals.map(tokenName), ...(unusedTerminals.length ? ["Unused"] : [])]
  const clashes = emitted.filter((name, i) => emitted.indexOf(name) != i)
  if (clashes.length) throw new Error(`two productions or terminals become ${clashes.join(" ")}`)

  const keywords = []
  for (const name of reachedProductions)
    for (const text of literals(grammar.get(name).expr)) if (isWord(text) && !keywords.includes(text)) keywords.push(text)
  if (caseInsensitive) for (const word of caseInsensitive) if (!keywords.includes(word)) throw new Error(`@caseInsensitive except "${word}": not a keyword`)
  const anyCase = word => caseInsensitive && !caseInsensitive.has(word)
  const keywordToken = word => (anyCase(word) ? `kw${word}` : JSON.stringify(word))

  // Rule bodies; `level` is 0 inside alternatives, 1 inside a sequence, 2 under an operator.
  function body(expr, inTokens, level = 0) {
    const wrap = (text, needed) => (needed ? `(${text})` : text)
    if (expr.alt) return wrap(expr.alt.map(e => body(e, inTokens, 0)).join(" | "), level > 0)
    if (expr.seq) return wrap(expr.seq.map(e => body(e, inTokens, 1)).join(" "), level > 1)
    if (expr.rep) return body(expr.expr, inTokens, 2) + expr.rep
    if (expr.ref) return grammar.get(expr.ref).terminal ? tokenName(expr.ref) : ruleName(expr.ref)
    if (expr.lit != null) return !inTokens && isWord(expr.lit) ? keywordToken(expr.lit) : lezerString(expr.lit)
    if (!inTokens) throw new Error("a character set outside a terminal")
    return `${expr.negated ? "!" : "$"}[${union(expr.set).map(([from, to]) => (from == to ? setChar(from) : `${setChar(from)}-${setChar(to)}`)).join("")}]`
  }
  const alternatives = expr => expr.alt ?? [expr]

  // Overlay rules named like a production add a @top, props, conflict markers or inline rules
  // to it; their body must be the generated one, markers and inline rule names aside.
  const ownRules = new Map(overlayRules.filter(rule => byRule.has(rule.name)).map(rule => [rule.name, rule]))
  const rules = []
  for (const name of reachedProductions) {
    const lezer = ruleName(name)
    const generated = alternatives(grammar.get(name).expr).map(e => body(e, false))
    const own = ownRules.get(lezer)
    if (own && normalize(own.body) != normalize(generated.join(" | ")))
      throw new Error(`gen/overlay.grammar: the body of ${lezer} differs from ${name}, which is: ${generated.join(" | ")}`)
    const text = own ? own.body.trim().replace(/\n\s*/g, "\n  ") : generated.join(" |\n  ")
    rules.push(`${own?.comment ?? ""}${own?.top ? "@top " : ""}${lezer}${own?.props ?? ""} {\n  ${text}\n}`)
  }
  // A top rule that no parse starts from unless asked to, so that Lezer keeps the tokens.
  if (unusedTerminals.length) rules.push(`@top Unused {\n  ${unusedTerminals.map(tokenName).join(" |\n  ")}\n}`)

  // Tokens: the terminals, the alternatives of PASSED TOKENS under the names the overlay's
  // @skip gives them, and the keywords; with what each matches, to order them.
  const tokens = [], matches = new Map()
  const skipNames = /^@skip\s*\{([^}]*)\}/m.exec(overlay)?.[1].split("|").map(s => s.trim()) ?? []
  const token = (name, expr) => {
    tokens.push(`  ${name} { ${body(expr, true)} }`)
    const regex = wholeRegExp(grammar, expr)
    matches.set(name, text => regex.test(text))
  }
  for (const name of terminals) token(tokenName(name), grammar.get(name).expr)
  if (grammar.has("PASSED TOKENS")) {
    const passed = alternatives(grammar.get("PASSED TOKENS").expr)
    if (skipNames.length != passed.length) throw new Error(`gen/overlay.grammar: @skip must name the ${passed.length} alternatives of PASSED TOKENS`)
    passed.forEach((expr, i) => token(skipNames[i], expr))
  }
  for (const word of keywords)
    if (anyCase(word)) {
      tokens.push(`  kw${word}[@name=${word}] { ${[...word].map(c => `$[${c.toUpperCase()}${c.toLowerCase()}]`).join(" ")} }`)
      matches.set(`kw${word}`, text => text.toLowerCase() == word.toLowerCase())
    }

  const tokenBlock = /^@tokens\s*\{/m.exec(overlay)
  if (!tokenBlock) throw new Error("gen/overlay.grammar has no @tokens block")
  const tokenEnd = closingBrace(overlay, tokenBlock.index + tokenBlock[0].length)
  const ownTokens = overlay.slice(tokenBlock.index + tokenBlock[0].length, tokenEnd)
  const kept = cut(overlay, [...[...ownRules.values()].map(rule => [rule.from, rule.to]), [tokenBlock.index, tokenEnd + 1]])

  const assemble = precedence =>
    [
      "// Generated by gen/ebnf2lezer.mjs from the grammar in spec/ and gen/overlay.grammar. Do not edit.",
      "",
      kept.trim(),
      "",
      "// One rule per production, in the order of the grammar.",
      "",
      rules.join("\n\n"),
      "",
      "@tokens {",
      tokens.join("\n\n"),
      ...(ownTokens.trim() ? ["", ownTokens.replace(/^\n+|\s+$/g, "")] : []),
      ...(precedence.length ? ["", "  // The longer match first (gen/CONFLICTS.md).", ...precedence.map(([a, b]) => `  @precedence { ${a}, ${b} }`)] : []),
      "}",
      "",
    ].join("\n")

  const wordsTs = [
    "// Generated by gen/ebnf2lezer.mjs from the grammar in spec/. Do not edit.",
    "",
    `export const keywords = ${JSON.stringify(keywords)}`,
    "",
  ].join("\n")
  const names = new Map([...reachedProductions.map(name => [name, ruleName(name)]), ...terminals.map(name => [name, tokenName(name)])])
  return {grammar: assemble(longestMatch(assemble, matches)), wordsTs, hidden, unused, names, skip: skipNames}
}

// Lezer wants an order for two tokens where both may come next and one matches a prefix of
// what the other matches, unless neither repeats. Builds the grammar, and for each pair Lezer
// reports puts the token with the longer match first, until none is left. Tokens that match
// the same text need a @precedence in the overlay.
function longestMatch(assemble, matches) {
  const pairs = []
  const match = (name, text) => (name.startsWith('"') ? JSON.parse(name) == text : matches.get(name)(text))
  for (;;) {
    try {
      buildParser(assemble(pairs), {externalPropSource: () => () => null})
      return pairs
    } catch (error) {
      const found = [...String(error.message).matchAll(/Overlapping tokens (\S+) and (\S+) used in same context \(example: ("(?:[^"\\]|\\.)*")(?: vs ("(?:[^"\\]|\\.)*"))?\)/g)]
      if (!found.length) throw error
      for (const [, a, b, exampleA, exampleB] of found) {
        const [x, y] = [exampleA, exampleB].map(e => e && JSON.parse(e))
        if (y == null || x == y || !(y.startsWith(x) || x.startsWith(y)))
          throw new Error(`tokens ${a} and ${b} both match ${exampleA}: give their order in a @precedence of gen/overlay.grammar`)
        const [short, long] = x.length < y.length ? [x, y] : [y, x]
        const shorter = [a, b].find(n => match(n, short) && !match(n, long))
        if (!shorter) throw new Error(`tokens ${a} and ${b} both match ${JSON.stringify(short)} and ${JSON.stringify(long)}: give their order in a @precedence of gen/overlay.grammar`)
        const pair = [shorter == a ? b : a, shorter]
        if (!pairs.some(p => p[0] == pair[0] && p[1] == pair[1])) pairs.push(pair)
      }
      pairs.sort((p, q) => (p.join() < q.join() ? -1 : 1))
    }
  }
}

// Lezer rejects a set that names a character twice, as [tbnrf\\\"\\'] in ECHAR does.
function union(ranges) {
  const merged = []
  for (const [from, to] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1]
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to)
    else merged.push([from, to])
  }
  return merged
}

function lezerString(text) {
  return `"${[...text].map(c => (c == '"' || c == "\\" ? `\\${c}` : printable(c) ? c : `\\u{${c.codePointAt(0).toString(16)}}`)).join("")}"`
}

const printable = c => c >= " " && c <= "~"

function setChar(code) {
  const c = String.fromCodePoint(code)
  if (!printable(c)) return `\\u{${code.toString(16)}}`
  return /[\\\]\-]/.test(c) ? `\\${c}` : c
}

function closingBrace(text, pos) {
  for (let depth = 1; ; pos++) {
    if (pos >= text.length) throw new Error("unclosed block")
    if (text[pos] == '"') pos = text.indexOf('"', pos + 1)
    else if (text[pos] == "{") depth++
    else if (text[pos] == "}" && !--depth) return pos
  }
}

function cut(text, ranges) {
  let out = "", pos = 0
  for (const [from, to] of ranges.sort((a, b) => a[0] - b[0])) {
    out += text.slice(pos, from)
    pos = to
  }
  return (out + text.slice(pos)).replace(/\n{3,}/g, "\n\n")
}

export const readOverlay = () => readFileSync(new URL("overlay.grammar", import.meta.url), "utf8")

const src = new URL("../packages/codemirror-lang-shex/src/", import.meta.url)
/// The files the generator writes, by the key of `generate`'s result they hold.
export const outputs = {grammar: new URL("shex.grammar", src), wordsTs: new URL("words.ts", src)}

if (process.argv[1] == fileURLToPath(import.meta.url)) {
  const generated = generate(readSpec().grammar, readOverlay())
  for (const [key, file] of Object.entries(outputs)) writeFileSync(file, generated[key])
}
