import {test} from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {buildParser} from "@lezer/generator"
import {directives, generate, lezerRules, outputs, readOverlay} from "./ebnf2lezer.mjs"
import {parseEbnf, readSpec, references} from "./ebnf.mjs"
import {extractGrammar, formatGrammar} from "./fetch.mjs"
import {wholeRegExp} from "./regex.mjs"

// Cases of terminals, [matches, non-matches], from the specification's examples and
// shexTest, and near misses; D3 and D4 of spec/README.md included.
const cases = {
  IRIREF: [["<http://a.example/S1>", "<>", "<#S>", "<a\\u0020b>"], ["<a b>", "<a\\n>", "<a{b>", "<a>b>"]],
  PNAME_NS: [[":", "ex:", "a.b:", "é:"], ["ex", ".a:", "a.:", "1a:", "_a:"]],
  PNAME_LN: [["ex:S", ":S", "ex:a.b", "ex:a%20b", "ex:\\~a", "ex:1", "ex:a:b"], ["ex:a.", "ex:-a", "ex:a~b", "ex:%2", "ex:"]],
  BLANK_NODE_LABEL: [["_:b", "_:1", "_:a.b", "_:a·̀ͯ‿.⁀"], ["_:", "_:a.", "_:-a"]],
  LANGTAG: [["@en", "@en-GB", "@de-1996"], ["@", "@en-", "@1en"]],
  INTEGER: [["0", "+1", "-12"], ["+-1", "1.0", "1a"]],
  DECIMAL: [["1.0", ".5", "-0.1"], ["1.", "1", "1.0e1"]],
  DOUBLE: [["1e1", "1.e1", ".5E-3", "-1.0e+2"], ["1e", "1.0", "e1"]],
  STRING_LITERAL2: [['"a"', '""', '"\\""', '"\\u00e9"', '"é"'], ['"a', '"\n"', '"\\q"', '"\\u12"']],
  STRING_LITERAL_LONG1: [["'''a'''", "''''a'''", "'''a\nb'''", "''''''"], ["''''", "'''a''''"]],
  LANG_STRING_LITERAL1: [["'a'@en", "''@de-AT"], ["'a'", "'a'@"]],
  REGEXP: [["/a/", "/^a.b$/i", "/\\//", "/\\-/", "/a\\[\\]/smix", "/\\u0061/"], ["//", "/a", "/a/q", "/\\A/", "/\\1/", "/\\d/", "/a\nb/"]],
  REPEAT_RANGE: [["{3}", "{1,}", "{1,2}", "{1,*}", "{+1,-2}"], ["{}", "{,1}", "{1,2,3}", "{a}"]],
  CODE: [["{ code %}", "{%}", "{ a\\%b %}", "{\\\\%}"], ["{ code }", "{ a % }"]],
  ATPNAME_LN: [["@ex:S", "@:S"], ["@ex:", "@ ex:S"]],
}

const spec = readSpec()
const overlay = readOverlay()
const generated = generate(spec.grammar, overlay)
const {grammar, hidden, unused, names, skip} = generated
const top = lezerRules(directives(overlay).rest).find(rule => rule.top)
const topProduction = [...names].find(([, lezer]) => lezer == top.name)[0]

// The Lezer rules and tokens of the generated grammar, and the names a body refers to:
// its words, outside strings and character sets.
const tokenBlock = grammar.slice(grammar.indexOf("\n@tokens {"))
const tokens = new Map([...tokenBlock.matchAll(/^ {2}(\w+)(?:\[[^\]]*\])? \{ (.*) \}$/gm)].map(m => [m[1], m[2]]))
const rules = new Map(lezerRules(grammar).map(rule => [rule.name, rule.body]))
const refs = body => [...body.replace(/"(?:[^"\\]|\\.)*"|[$!]\[(?:[^\]\\]|\\.)*\]/g, "").matchAll(/[A-Za-z_]\w*/g)].map(([word]) => word)

// A parser that reads `token` and nothing else, with the token definitions it uses.
function tokenParser(token) {
  const used = new Set()
  const use = name => {
    if (used.has(name) || !tokens.has(name)) return
    used.add(name)
    refs(tokens.get(name)).forEach(use)
  }
  use(token)
  return buildParser(`@top T { ${token} }\n@tokens {\n${[...used].map(name => `  ${name} { ${tokens.get(name)} }`).join("\n")}\n}`)
}
const reads = (parser, text) => {
  let ok = true
  parser.parse(text).iterate({enter: node => { if (node.type.isError) ok = false }})
  return ok
}

test("the committed files are what the generator writes", () => {
  for (const [key, file] of Object.entries(outputs)) assert.equal(readFileSync(file, "utf8"), generated[key], key)
})

test("every production and terminal of the grammar in spec/ is reachable from a top rule, except the @unused productions", () => {
  const reached = new Set()
  const visit = name => {
    if (reached.has(name)) return
    reached.add(name)
    refs(rules.get(name) ?? tokens.get(name) ?? "").forEach(visit)
  }
  for (const rule of lezerRules(grammar)) if (rule.top) visit(rule.name)
  skip.forEach(visit)
  const missing = [...spec.grammar.keys()].filter(name => name != "PASSED TOKENS" && !reached.has(names.get(name)))
  assert.deepEqual(missing, [...unused].filter(name => !spec.grammar.get(name).terminal))
})

test("every production that is not hidden or unused, and every terminal a production names, is a node type", () => {
  const types = new Set(buildParser(grammar, {externalPropSource: () => () => null}).nodeSet.types.map(type => type.name))
  const productions = [...spec.grammar].filter(([, {terminal}]) => !terminal)
  const expected = new Set([
    ...productions.filter(([name]) => !hidden.has(name) && !unused.has(name)).map(([name]) => names.get(name)),
    ...productions.flatMap(([, {expr}]) => [...references(expr)]).filter(ref => spec.grammar.get(ref).terminal).map(ref => names.get(ref)),
  ])
  assert.deepEqual([...expected].filter(name => !types.has(name)), [])
})

test("the grammar builds without a warning and has no ambiguity marker", () => {
  assert.doesNotMatch(grammar, /~\w/)
  assert.doesNotThrow(() => buildParser(grammar, {externalPropSource: () => () => null, warn: message => assert.fail(message)}))
})

test("an overlay rule named like a production must repeat its body", () => {
  const changed = overlay.replace(top.body, `${top.body} ${top.body}`)
  assert.notEqual(changed, overlay)
  assert.throws(() => generate(spec.grammar, changed), new RegExp(`body of ${top.name} differs`))
})

test("undefined and unused productions are errors", () => {
  const withRule = (name, production) => new Map([...spec.grammar, [name, production]])
  const {expr} = spec.grammar.get(topProduction)
  assert.throws(() => generate(withRule(topProduction, {number: "", terminal: false, expr: {seq: [expr, {ref: "NOTHING"}]}}), overlay),
    new RegExp(`${topProduction} refers to NOTHING, which is not defined`))
  assert.throws(() => generate(withRule("orphan", {number: "", terminal: false, expr: {lit: ","}}), overlay), /unused productions: orphan/)
  for (const name of unused)
    assert.throws(() => generate(spec.grammar, overlay.replace(new RegExp(`^(@unused\\b.*?) ${name}\\b`, "m"), "$1")),
      new RegExp(`unused productions: .*\\b${name}\\b`))
})

test("the extractor reads the rendered rows of the grammar table", () => {
  const html = `<section id="other"><table><tr><td id="prod-x">[<span class="prodNo">0</span>]</td><td><code>x</code></td><td>::=</td><td>'x'</td></tr></table></section>
    <section id="g"><section id="inner"><!-- <tr><td id="prod-gone">[<span class="prodNo">9</span>]</td><td>gone</td><td>::=</td><td>'a'</td></tr> --></section>
    <table>
    <tr><td id="prod-a">[<span class="prodNo">1</span>]&nbsp;</td><td><code class="production">a</code></td><td>&nbsp;::=&nbsp;</td><td><code>b ('&lt;' | "&amp;")<br />\u00a0 | <a href="#term-B">B</a></code></td></tr>
    <tr class="obj"><td></td><td>A</td><td>{</td><td>ShExJ</td></tr>
    <tr><td id="term-B">[<span class="prodNo">2t</span>]</td><td>&lt;<code class="production">B</code>&gt;</td><td>::=</td><td>[#0000-#x1F]</td></tr>
    <tr><td id="term-PASSED_TOKENS"></td><td><code>PASSED TOKENS</code></td><td>::=</td><td>[ \\t]+</td></tr>
    </table></section>`
  assert.deepEqual(formatGrammar(extractGrammar(html, "g")), [`[1] a ::= b ('<' | "&")\n    | B`, "[2t] <B> ::= [#0000-#x1F]", "[] PASSED TOKENS ::= [ \\t]+"])
  assert.throws(() => extractGrammar(html, "missing"), /no <section id="missing">/)
})

test("the notation: escapes, hexadecimal characters, operators after a space", () => {
  const [[, a], [, b]] = [...parseEbnf("[1] a ::= x (y | 'z\\'') +\n    | \"\\\\u\"\n[2] <B> ::= [^#0000- \\n\\]#x10000-#EFFFF]")]
  assert.deepEqual(a.expr, {alt: [{seq: [{ref: "x"}, {rep: "+", expr: {alt: [{ref: "y"}, {lit: "z'"}]}}]}, {lit: "\\u"}]})
  assert.deepEqual(b.expr, {set: [[0, 0x20], [0x0a, 0x0a], [0x5d, 0x5d], [0x10000, 0xeffff]], negated: true})
  assert.equal(b.terminal, true)
  assert.throws(() => parseEbnf("[1] a ::= b - c"), /expected a name/)
  assert.throws(() => parseEbnf("[1] a ::= 'b'\n[2] a ::= 'c'"), /a is defined twice/)
})

// Lezer's reading of each token against the regular expression of its terminal, on strings
// generated from the terminal and on one-character edits of them.
test("every token matches what its terminal matches", () => {
  let seed = 1
  const random = n => {
    seed = (seed + 0x6d2b79f5) | 0
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) % n
  }
  const alphabet = [..."aZeE_09.:-+%\\u@<>\"' \n#^{}/*~é·\u0300😀"]
  const sample = expr => {
    if (expr.alt) return sample(expr.alt[random(expr.alt.length)])
    if (expr.seq) return expr.seq.map(sample).join("")
    if (expr.rep) {
      const [min, max] = {"?": [0, 1], "*": [0, 3], "+": [1, 3]}[expr.rep]
      return Array.from({length: min + random(max - min + 1)}, () => sample(expr.expr)).join("")
    }
    if (expr.lit != null) return expr.lit
    if (expr.set) {
      const inSet = c => expr.set.some(([from, to]) => c.codePointAt(0) >= from && c.codePointAt(0) <= to)
      if (expr.negated) {
        const allowed = alphabet.filter(c => !inSet(c))
        return allowed[random(allowed.length)]
      }
      const [from, to] = expr.set[random(expr.set.length)]
      return String.fromCodePoint(from + random(Math.min(to - from, 0x7f) + 1))
    }
    return sample(spec.grammar.get(expr.ref).expr)
  }
  const edit = text => {
    const chars = [...text], at = random(chars.length + 1), c = alphabet[random(alphabet.length)]
    chars.splice(at, random(2), ...(random(3) ? [c] : []))
    return chars.join("")
  }
  const passed = spec.grammar.get("PASSED TOKENS").expr.alt
  const terminals = [...spec.grammar]
    .filter(([name, {terminal}]) => terminal && names.has(name))
    .map(([name, {expr}]) => [name, expr, names.get(name)])
  terminals.push(...passed.map((expr, i) => [`PASSED TOKENS (${skip[i]})`, expr, skip[i]]))
  for (const [name, expr, token] of terminals) {
    const parser = tokenParser(token)
    const whole = wholeRegExp(spec.grammar, expr)
    const counts = [0, 0]
    for (let i = 0; i < 400; i++) {
      const text = i % 2 ? edit(sample(expr)) : sample(expr)
      const lezer = reads(parser, text)
      assert.equal(lezer, whole.test(text), `${name} on ${JSON.stringify(text)}`)
      counts[+lezer]++
    }
    assert.ok(counts[0] && counts[1], `${name}: ${counts[1]} matches, ${counts[0]} non-matches`)
  }
})

test("the terminals and their tokens read their cases", () => {
  for (const [name, [yes, no]] of Object.entries(cases)) {
    const regex = wholeRegExp(spec.grammar, spec.grammar.get(name).expr), parser = tokenParser(names.get(name))
    for (const s of yes) assert.ok(regex.test(s) && reads(parser, s), `${name} rejects ${JSON.stringify(s)}`)
    for (const s of no) assert.ok(!regex.test(s) && !reads(parser, s), `${name} accepts ${JSON.stringify(s)}`)
  }
})
