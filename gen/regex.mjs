// Translates the terminals of a grammar read by ebnf.mjs into JavaScript regular expressions
// (with the `u` flag), as a second reading against which the Lezer tokens are tested.

const escape = code => `\\u{${code.toString(16)}}`

/// A regular expression source matching the strings of `expr`, inlining the terminals it
/// refers to.
export function regexSource(grammar, expr) {
  const visit = expr => {
    if (expr.alt) return `(?:${expr.alt.map(visit).join("|")})`
    if (expr.seq) return `(?:${expr.seq.map(visit).join("")})`
    if (expr.rep) return `(?:${visit(expr.expr)})${expr.rep}`
    if (expr.lit != null) return [...expr.lit].map(c => escape(c.codePointAt(0))).join("")
    if (expr.set) {
      const ranges = expr.set.map(([from, to]) => (from == to ? escape(from) : `${escape(from)}-${escape(to)}`)).join("")
      return `[${expr.negated ? "^" : ""}${ranges}]`
    }
    const target = grammar.get(expr.ref)
    if (!target?.terminal) throw new Error(`${expr.ref} is not a terminal`)
    return visit(target.expr)
  }
  return visit(expr)
}

export const wholeRegExp = (grammar, expr) => new RegExp(`^(?:${regexSource(grammar, expr)})$`, "u")
