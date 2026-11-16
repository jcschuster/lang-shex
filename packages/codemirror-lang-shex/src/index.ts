import {parser} from "./shex.grammar"
import {keywords} from "./words"
import {LRLanguage, LanguageSupport, indentNodeProp, foldNodeProp, syntaxTree, TreeIndentContext} from "@codemirror/language"
import type {SyntaxNode} from "@lezer/common"
import type {Completion, CompletionContext, CompletionResult} from "@codemirror/autocomplete"

const brackets: Record<string, [string, string]> = {
  ShapeDefinition: ["{", "}"],
  InlineShapeDefinition: ["{", "}"],
  BracketedTripleExpr: ["(", ")"],
  ShapeAtom: ["(", ")"],
  InlineShapeAtom: ["(", ")"],
  ExtendsShapeAtom: ["(", ")"],
  ValueSet: ["[", "]"],
}

/// Inside brackets, one unit in from the line of the opening one; the closing one lines up
/// with that line.
const bracketIndent = ([open, close]: [string, string]) => (context: TreeIndentContext) => {
  const from = context.node.getChild(open), to = context.node.getChild(close)
  if (!from || from.to > context.pos || (to && to.from < context.pos)) return context.continue()
  return context.lineIndent(from.from) + (context.textAfter.trimStart().startsWith(close) ? 0 : context.unit)
}

const foldBrackets = ([open, close]: [string, string]) => (node: SyntaxNode) => {
  const from = node.getChild(open), to = node.getChild(close)
  return from && to ? {from: from.to, to: to.from} : null
}

const keywordCompletions: Completion[] = keywords.map(label => ({label, type: "keyword"}))
// Where a keyword cannot start: inside these tokens, or right after a character that joins
// the word to a name, IRI, string or number.
const noKeywords = new Set(["Iriref", "PnameLn", "PnameNs", "AtpnameLn", "AtpnameNs", "BlankNodeLabel", "Langtag", "Regexp", "Code",
  "StringLiteral1", "StringLiteral2", "StringLiteralLong1", "StringLiteralLong2", "LangStringLiteral1", "LangStringLiteral2",
  "LangStringLiteralLong1", "LangStringLiteralLong2", "LineComment", "BlockComment"])
// Comments, strings, regular expressions, IRIs, semantic actions and escapes, each from its
// start to its end or, unclosed, to where its token would end. One that is not closed is no
// token of the tree, so the text before a word is scanned for it.
const opaque = new RegExp([
  /#.*/, /\/\*[^]*?(?:\*\/|$)/, /'''(?:\\[^]|[^\\])*?(?:'''|$)/, /"""(?:\\[^]|[^\\])*?(?:"""|$)/,
  /'(?:\\.|[^'\\\n])*'?/, /"(?:\\.|[^"\\\n])*"?/, /\/(?:\\.|[^/\\\n])*\/?/, /<[^>\s]*>?/,
  /%\s*(?:<[^>\s]*>|[^\s{%]+)\s*(?:\{(?:\\[^]|[^\\])*?(?:%\}|$)|%?)/, /\\[^]/,
].map(part => part.source).join("|"), "g")

/// Whether a word at the end of `text` would be inside one of the `opaque` constructs.
function inOpaque(text: string) {
  // The letter stands for the word: it continues an open construct and starts none.
  const scanned = text + "x"
  opaque.lastIndex = 0
  for (let m; (m = opaque.exec(scanned)); ) if (m.index + m[0].length > text.length) return true
  return false
}

/// Keywords, on a word that is not part of a name, IRI, string, comment, regular expression
/// or semantic action, closed or not.
function shexCompletion(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[A-Za-z]*/)!
  if (!word.text && !context.explicit) return null
  if (/[\w:.\-@%\\/<"']/.test(context.state.sliceDoc(word.from - 1, word.from))) return null
  if (noKeywords.has(syntaxTree(context.state).resolveInner(word.from, 1).name)) return null
  if (inOpaque(context.state.sliceDoc(0, word.from))) return null
  return {from: word.from, options: keywordCompletions, validFor: /^[A-Za-z]*$/}
}

/// The ShExC language: highlighting (from `highlight.ts`, attached by the grammar), folding
/// and indentation of shapes `{ }`, groups `( )` and value sets `[ ]`, and completion of
/// keywords.
export const shexLanguage = LRLanguage.define({
  name: "shex",
  parser: parser.configure({
    props: [
      indentNodeProp.add(type => (brackets[type.name] ? bracketIndent(brackets[type.name]) : undefined)),
      foldNodeProp.add(type => (brackets[type.name] ? foldBrackets(brackets[type.name]) : undefined)),
    ],
  }),
  languageData: {
    commentTokens: {line: "#", block: {open: "/*", close: "*/"}},
    closeBrackets: {brackets: ["(", "[", "{", '"', "'"]},
    autocomplete: shexCompletion,
  },
})

/// ShExC language support for CodeMirror.
export function shex() {
  return new LanguageSupport(shexLanguage)
}
