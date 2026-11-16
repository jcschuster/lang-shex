import {shex} from "../dist/index.js"
import {EditorState} from "@codemirror/state"
import {CompletionContext} from "@codemirror/autocomplete"
import {foldable, getIndentation} from "@codemirror/language"
import assert from "assert"

const state = doc => EditorState.create({doc, extensions: [shex()]})

describe("completion", () => {
  // Labels offered at the end of `doc`.
  function labels(doc, explicit = false) {
    const s = state(doc)
    const [source] = s.languageDataAt("autocomplete", doc.length)
    const result = source(new CompletionContext(s, doc.length, explicit))
    return result && result.options.map(option => option.label)
  }

  it("offers the keywords on a word", () => {
    const offered = labels("PREFIX ex: <http://ex.example/>\nex:S { ex:p IRI MIN")
    assert.ok(offered.includes("MINLENGTH") && offered.includes("PREFIX") && offered.includes("start") && offered.includes("EXTENDS"))
  })

  it("offers nothing inside a name, IRI, string or comment, or on no word unless asked", () => {
    assert.equal(labels("ex:S { ex:p"), null)
    assert.equal(labels("<http://ex"), null)
    assert.equal(labels('<S> ["ab'), null)
    assert.equal(labels("# PRE"), null)
    assert.equal(labels("<S> "), null)
    assert.ok(labels("<S> ", true).includes("CLOSED"))
  })

  it("offers nothing inside an unclosed comment, semantic action, regular expression or string", () => {
    for (const doc of ["/* PRE", "<S> { <p> . %<x>{ PRE", "<S> { <p> /ab cd", '<S> { <p> ["ab cd', "<S> { <p> ['''ab\ncd"])
      assert.equal(labels(doc), null, JSON.stringify(doc))
  })

  it("offers the keywords after closed ones", () => {
    for (const doc of ["/* a */ PRE", "<S> { <p> . %<x>{ a \\%} %} } PRE", "<S> { <p> /a\\/b c/ MIN", '<S> { <p> ["ab cd"] } PRE',
      "<S> { <p> ['''a\\''''] } PRE", "<S> { <p> ['ab\nPRE", "<a'b#c> IRI MIN"])
      assert.ok(labels(doc)?.includes("PREFIX"), JSON.stringify(doc))
  })
})

describe("indentation", () => {
  // Indentation of the last line of `doc`.
  const indent = doc => getIndentation(state(doc), doc.lastIndexOf("\n") + 1)

  it("indents one unit inside a shape, group or value set", () => {
    assert.equal(indent("<S> {\n"), 2)
    assert.equal(indent("<S> {\n  <p> [\n"), 4)
    assert.equal(indent("<S> {\n  ( <p> .\n"), 4)
  })

  it("lines a closing bracket up with the line of the opening one", () => {
    assert.equal(indent("<S> {\n  <p> .\n}"), 0)
    assert.equal(indent("<S> {\n  <p> [\n    <v>\n  ]"), 2)
  })

  it("leaves the top level unindented", () => {
    assert.equal(indent("<S> { <p> . }\n"), 0)
  })
})

describe("folding", () => {
  it("folds a shape inside its braces", () => {
    const doc = "<S> CLOSED {\n  <p> .\n} // <a> 1"
    assert.deepStrictEqual(foldable(state(doc), 0, doc.indexOf("\n")), {from: doc.indexOf("{") + 1, to: doc.indexOf("}")})
  })

  it("folds a value set inside its brackets", () => {
    const doc = "<S> {\n  <p> [\n    <v>\n  ]\n}"
    const line = doc.indexOf("[")
    assert.deepStrictEqual(foldable(state(doc), doc.lastIndexOf("\n", line) + 1, doc.indexOf("\n", line)), {from: line + 1, to: doc.indexOf("]")})
  })
})
