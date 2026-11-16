import {shexLanguage} from "../dist/index.js"
import {getStyleTags, highlightTree, tagHighlighter, tags as t} from "@lezer/highlight"
import {fileTests} from "@lezer/generator/dist/test"
import assert from "assert"
import * as fs from "fs"
import * as path from "path"
import {fileURLToPath} from "url"

const here = path.dirname(fileURLToPath(import.meta.url))
const shexTest = path.join(here, "..", "..", "..", "fixtures", "shexTest")
const parse = text => shexLanguage.parser.parse(text)

function errors(text) {
  const found = []
  parse(text).iterate({
    enter: node => { if (node.type.isError) found.push(JSON.stringify(text.slice(node.from, node.from + 30))) },
  })
  return found
}

const files = dir =>
  fs.readdirSync(path.join(shexTest, dir), {recursive: true}).filter(file => file.endsWith(".shex")).sort()

// Negative tests whose error is not one of syntax: what makes them wrong needs more than
// the grammar, so they parse without error nodes.
const accepted = {
  negativeSyntax: {
    "1ProductionShapeCollision.shex": "a label used for a shape expression and a triple expression",
    "1ShapeProductionCollision.shex": "a label used for a triple expression and a shape expression",
    "1dotDuplicateProductionLabel.shex": "a triple expression label declared twice",
    "1dotDuplicateShapeLabel.shex": "a shape expression label declared twice",
    "1iriLength2.shex": "two LENGTH facets",
    "1literalLength2.shex": "two LENGTH facets",
    "1unknowndatatypeMaxInclusive.shex": "a numeric facet on a datatype that is not numeric",
    "prefix-missing.shex": "a prefix that is not declared",
    "prefix-missing-1.shex": "a prefix that is not declared",
    "prefix-missing-2.shex": "prefixes that are not declared",
  },
  negativeStructure: Object.fromEntries(files("negativeStructure").map(file => [file, "a structural error"])),
}
// The grammar of ShEx 2.1 derives an inclusion in parentheses with a cardinality or a
// label; shex.js rejects these while building ShExJ, not by its grammar.
accepted.negativeStructure["includeWithCardinality.shex"] = "an inclusion in parentheses with a cardinality"
accepted.negativeStructure["includeWithLabel.shex"] = "an inclusion in parentheses with a label"

describe("fixtures/shexTest", () => {
  for (const file of files("schemas")) {
    it(`schemas/${file} parses without error nodes`, () => {
      assert.deepStrictEqual(errors(fs.readFileSync(path.join(shexTest, "schemas", file), "utf8")), [])
    })
  }
  for (const dir of ["negativeSyntax", "negativeStructure"]) {
    for (const file of files(dir)) {
      const reason = accepted[dir][file]
      it(`${dir}/${file} ${reason ? `parses (${reason})` : "has an error node"}`, () => {
        const found = errors(fs.readFileSync(path.join(shexTest, dir, file), "utf8"))
        if (reason) assert.deepStrictEqual(found, [])
        else assert.notDeepStrictEqual(found, [])
      })
    }
    it(`every exception names a file of ${dir}`, () => {
      assert.deepStrictEqual(Object.keys(accepted[dir]).filter(file => !files(dir).includes(file)), [])
    })
  }
})

describe("highlighting", () => {
  // One class per tag the highlight table uses, so modified tags stay distinct.
  const highlighter = tagHighlighter([
    {tag: t.moduleKeyword, class: "directive"},
    {tag: t.definitionKeyword, class: "start"},
    {tag: t.modifier, class: "modifier"},
    {tag: t.keyword, class: "keyword"},
    {tag: t.logicOperator, class: "logic"},
    {tag: t.standard(t.typeName), class: "kind"},
    {tag: t.attributeName, class: "facet"},
    {tag: t.definition(t.className), class: "shape-definition"},
    {tag: t.className, class: "shape"},
    {tag: t.labelName, class: "label"},
    {tag: t.propertyName, class: "predicate"},
    {tag: t.typeName, class: "datatype"},
    {tag: t.macroName, class: "action"},
    {tag: t.special(t.string), class: "code"},
    {tag: t.annotation, class: "annotation"},
    {tag: t.url, class: "iri"},
    {tag: t.namespace, class: "prefix"},
    {tag: t.special(t.variableName), class: "bnode"},
    {tag: t.string, class: "string"},
    {tag: t.attributeValue, class: "langtag"},
    {tag: t.integer, class: "integer"},
    {tag: t.float, class: "float"},
    {tag: t.bool, class: "bool"},
    {tag: t.regexp, class: "regexp"},
    {tag: t.operator, class: "operator"},
    {tag: t.atom, class: "dot"},
    {tag: t.lineComment, class: "comment"},
    {tag: t.blockComment, class: "block-comment"},
    {tag: t.paren, class: "paren"},
    {tag: t.brace, class: "brace"},
    {tag: t.squareBracket, class: "bracket"},
  ])

  // Each highlighted piece of text with its class, in document order.
  function classes(text) {
    const result = []
    highlightTree(parse(text), highlighter, (from, to, cls) => result.push([text.slice(from, to), cls]))
    return result
  }

  it("tells directives, labels, predicates, node constraints, literals and comments apart", () => {
    const text = [
      "# c",
      "PREFIX ex: <http://ex.example/>",
      "BASE <http://b.example/> IMPORT <i>",
      "%ex:act{ code %}",
      "start = @ex:S",
      "ABSTRACT ex:S EXTENDS @<T> CLOSED EXTRA a {",
      "  $<l> ^ex:p xsd:int MININCLUSIVE 1 {2,3} // ex:note 'x'@en ;",
      '  a [ex:v~ - ex:w 1.5 true @fr] ? ;',
      "  ex:q IRI /^a/i OR NOT LITERAL * ;",
      "  ( ex:r . ) + ; & _:b",
      "} /* d */",
      "<U> EXTERNAL",
    ].join("\n")
    assert.deepStrictEqual(classes(text), [
      ["# c", "comment"],
      ["PREFIX", "directive"], ["ex:", "prefix"], ["<http://ex.example/>", "iri"],
      ["BASE", "directive"], ["<http://b.example/>", "iri"], ["IMPORT", "directive"], ["<i>", "iri"],
      ["ex:act", "action"], ["{ code %}", "code"],
      ["start", "start"], ["@ex:S", "shape"],
      ["ABSTRACT", "modifier"], ["ex:S", "shape-definition"], ["EXTENDS", "keyword"], ["@<T>", "shape"],
      ["CLOSED", "modifier"], ["EXTRA", "modifier"], ["a", "keyword"], ["{", "brace"],
      ["<l>", "label"], ["^", "operator"], ["ex:p", "predicate"], ["xsd:int", "datatype"], ["MININCLUSIVE", "facet"],
      ["1", "integer"], ["{2,3}", "operator"], ["// ex:note 'x'@en", "annotation"],
      ["a", "keyword"], ["[", "bracket"], ["ex:v", "iri"], ["ex:w", "iri"], ["1.5", "float"], ["true", "bool"],
      ["@fr", "langtag"], ["]", "bracket"], ["?", "operator"],
      ["ex:q", "predicate"], ["IRI", "kind"], ["/^a/i", "regexp"], ["OR", "logic"], ["NOT", "logic"], ["LITERAL", "kind"],
      ["*", "operator"],
      ["(", "paren"], ["ex:r", "predicate"], [".", "dot"], [")", "paren"], ["+", "operator"], ["_:b", "label"],
      ["}", "brace"], ["/* d */", "block-comment"],
      ["<U>", "shape-definition"], ["EXTERNAL", "modifier"],
    ])
  })

  it("highlights strings, numbers and blank nodes in value sets", () => {
    assert.deepStrictEqual(classes(`<S> ["a" """b""" 'c'@en -1 2e3 false _:x]`).filter(([, cls]) => cls != "bracket"), [
      ["<S>", "shape-definition"], ['"a"', "string"], ['"""b"""', "string"], ["'c'@en", "string"], ["-1", "integer"],
      ["2e3", "float"], ["false", "bool"], ["_:x", "bnode"],
    ])
  })

  // Nodes that carry no tag of their own: their children do, or a rule with a context.
  const untagged = new Set([
    "ShexDoc", "BaseDecl", "PrefixDecl", "ImportDecl", "Start", "StartActions", "ShapeExprDecl", "ShapeExprLabel",
    "ShapeAtom", "InlineShapeAtom", "ExtendsShapeAtom", "ShapeDefinition", "InlineShapeDefinition", "Extension",
    "Restriction", "ExtraPropertySet", "LitNodeConstraint", "NonLitNodeConstraint", "LitInlineNodeConstraint",
    "NonLitInlineNodeConstraint", "NonLiteralKind", "StringFacet", "StringLength", "NumericFacet", "NumericRange",
    "NumericLength", "NumericLiteral", "TripleConstraint", "BracketedTripleExpr", "MultiElementGroup",
    "MultiElementOneOf", "Include", "Predicate", "ValueSet", "IriRange", "IriExclusion", "LiteralRange",
    "LiteralExclusion", "LanguageRange", "LanguageExclusion", "Exclusion", "CodeDecl", "Iri", "PrefixedName",
    "BlankNode", "RdfLiteral", "String", "LangString", "AtpnameLn", "AtpnameNs",
  ])

  it("tags every node type, or lists it as untagged", () => {
    // Context-free rules only: every tagged node type has one.
    for (const type of shexLanguage.parser.nodeSet.types) {
      if (!type.name || type.isError) continue
      assert.equal(!!getStyleTags({type, matchContext: () => false}), !untagged.has(type.name), type.name)
    }
  })
})

describe("coverage", () => {
  it("every node type occurs in a test case", () => {
    const seen = new Set()
    const visit = text => parse(text).iterate({enter: node => { seen.add(node.name) }})
    for (const file of fs.readdirSync(here).filter(f => f.endsWith(".txt")))
      for (const {text} of fileTests(fs.readFileSync(path.join(here, file), "utf8"), file)) visit(text)
    const names = shexLanguage.parser.nodeSet.types.filter(type => type.name && !type.isError).map(type => type.name)
    assert.deepStrictEqual(names.filter(name => !seen.has(name)), [])
  })
})
