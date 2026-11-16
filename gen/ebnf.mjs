// Reads the grammar files of spec/ in the notation of spec/README.md: the extracted
// grammar, and spec/deviations.ebnf, whose productions replace those of the same name.
import {readFileSync} from "node:fs"
import {readSource, specFile} from "./fetch.mjs"

/// The productions of an .ebnf file, in file order: name -> {number, terminal, expr}.
/// An expression is {alt: [expr]}, {seq: [expr]}, {rep: "*" | "+" | "?", expr}, {ref: name},
/// {lit: string} or {set: [[from, to]], negated}, with code points as numbers.
export function parseEbnf(text) {
  const productions = new Map()
  let current = null
  text.split("\n").forEach((line, index) => {
    const at = `line ${index + 1}`
    if (!line.trim() || line.startsWith("#")) return
    const head = /^\[([^\]]*)\]\s+(.+?)\s+::=(.*)$/.exec(line)
    if (head) {
      const [, number, written, body] = head
      const terminal = /^<\w+>$/.test(written) || written == "PASSED TOKENS"
      const name = written.replace(/^<|>$/g, "")
      if (productions.has(name)) throw new Error(`${at}: ${name} is defined twice`)
      current = {name, number: number.trim(), terminal, body, at}
      productions.set(name, current)
    } else if (/^\s/.test(line) && current) {
      current.body += "\n" + line
    } else {
      throw new Error(`${at}: expected a production or an indented continuation: ${line}`)
    }
  })
  return new Map([...productions].map(([name, {number, terminal, body, at}]) => [name, {number, terminal, expr: parseExpression(body, `${at} (${name})`)}]))
}

const simpleEscapes = {n: 0x0a, r: 0x0d, t: 0x09}

function parseExpression(src, at) {
  let pos = 0
  const fail = message => {
    throw new Error(`${at}, at ${JSON.stringify(src.slice(pos, pos + 20))}: ${message}`)
  }
  const space = () => {
    while (/\s/.test(src[pos] ?? "")) pos++
  }

  // One character of a string or set: a backslash escape, #xHEX or #HEX (sets only), or itself.
  function char(inSet) {
    if (src[pos] == "\\") {
      const e = src[pos + 1]
      if (e == undefined) fail("backslash at the end")
      pos += 2
      return simpleEscapes[e] ?? e.codePointAt(0)
    }
    if (inSet && src[pos] == "#") {
      const m = /^#x?([0-9A-Fa-f]+)/.exec(src.slice(pos))
      if (m) {
        pos += m[0].length
        return parseInt(m[1], 16)
      }
    }
    const c = src.codePointAt(pos)
    pos += c > 0xffff ? 2 : 1
    return c
  }

  function alternation() {
    const items = [sequence()]
    while (src[pos] == "|") {
      pos++
      items.push(sequence())
    }
    return items.length == 1 ? items[0] : {alt: items}
  }

  function sequence() {
    const items = []
    for (space(); pos < src.length && src[pos] != "|" && src[pos] != ")"; space()) {
      let expr = primary()
      for (space(); "*+?".includes(src[pos] ?? "|"); space()) expr = {rep: src[pos++], expr}
      items.push(expr)
    }
    if (!items.length) fail("empty alternative")
    return items.length == 1 ? items[0] : {seq: items}
  }

  function primary() {
    const c = src[pos]
    if (c == "(") {
      pos++
      const inner = alternation()
      if (src[pos++] != ")") fail("unclosed (")
      return inner
    }
    if (c == "'" || c == '"') {
      pos++
      let text = ""
      while (src[pos] != c) {
        if (pos >= src.length) fail("unclosed string")
        text += String.fromCodePoint(char(false))
      }
      pos++
      if (!text) fail("empty string")
      return {lit: text}
    }
    if (c == "[") return set()
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(pos))
    if (!name) fail("expected a name, string, set or (")
    pos += name[0].length
    return {ref: name[0]}
  }

  function set() {
    pos++
    const negated = src[pos] == "^"
    if (negated) pos++
    const ranges = []
    while (src[pos] != "]") {
      if (pos >= src.length) fail("unclosed [")
      const from = char(true)
      if (src[pos] == "-" && src[pos + 1] != "]") {
        pos++
        const to = char(true)
        if (to < from) fail("empty range")
        ranges.push([from, to])
      } else {
        ranges.push([from, from])
      }
    }
    pos++
    return {set: ranges, negated}
  }

  const expr = alternation()
  if (pos != src.length) fail("unbalanced )")
  return expr
}

/// The extracted grammar (spec/SOURCE `grammar`), the deviations, and both merged: a deviation
/// replaces the production of its name in place, or follows the extracted ones if new.
export function readSpec() {
  const extracted = parseEbnf(readFileSync(specFile(readSource().get("grammar")), "utf8"))
  const deviations = parseEbnf(readFileSync(specFile("deviations.ebnf"), "utf8"))
  return {extracted, deviations, grammar: merge(extracted, deviations)}
}

export function merge(extracted, deviations) {
  const grammar = new Map(extracted)
  for (const [name, production] of deviations) {
    if (grammar.has(name) && grammar.get(name).terminal != production.terminal) throw new Error(`deviation ${name} changes a terminal into a production or back`)
    grammar.set(name, production)
  }
  return grammar
}

/// The names an expression refers to.
export function references(expr, into = new Set()) {
  if (expr.ref) into.add(expr.ref)
  for (const item of expr.alt ?? expr.seq ?? (expr.expr ? [expr.expr] : [])) references(item, into)
  return into
}

/// The string literals of an expression.
export function literals(expr, into = new Set()) {
  if (expr.lit != null) into.add(expr.lit)
  for (const item of expr.alt ?? expr.seq ?? (expr.expr ? [expr.expr] : [])) literals(item, into)
  return into
}
