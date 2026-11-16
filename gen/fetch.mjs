// Downloads the specification that spec/SOURCE pins (`url`), checks its `sha256`, and writes
// the grammar table of its section `section` to spec/<grammar>, one production per table row.
// `node gen/fetch.mjs page.html` reads a saved copy instead. Notation: spec/README.md.
import {createHash} from "node:crypto"
import {readFileSync, writeFileSync} from "node:fs"
import {fileURLToPath} from "node:url"

export const specFile = name => new URL(`../spec/${name}`, import.meta.url)

/// The `key: value` lines of spec/SOURCE.
export function readSource() {
  const fields = new Map()
  for (const line of readFileSync(specFile("SOURCE"), "utf8").split("\n")) {
    const m = /^(\w+):\s*(.*)$/.exec(line)
    if (m) fields.set(m[1], m[2].trim())
  }
  return fields
}

const entities = {lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " "}

function decode(html) {
  return html.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name) => {
    if (name[0] != "#") return entities[name] ?? whole
    return String.fromCodePoint(name[1] == "x" || name[1] == "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10))
  })
}

// Rendered text of a table cell: line breaks at <br>, tags dropped, no-break spaces as spaces,
// each line trimmed, empty lines dropped.
function cellText(html) {
  const text = decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "")).replace(/\u00a0/g, " ")
  return text.split("\n").map(line => line.trim()).filter(Boolean)
}

/// The productions of the grammar table in `<section id="${section}">`, as
/// {number, name, lines}: every table row of four cells whose first cell has the id
/// prod-NAME or term-NAME. HTML comments are removed first, so the rows are those the page
/// renders.
export function extractGrammar(html, section) {
  html = html.replace(/<!--[\s\S]*?-->/g, "")
  const open = new RegExp(`<section\\b[^>]*\\bid="${section}"[^>]*>`).exec(html)
  if (!open) throw new Error(`no <section id="${section}">`)
  const tag = /<(\/?)section\b[^>]*>/g
  tag.lastIndex = open.index + open[0].length
  let depth = 1, m
  while (depth && (m = tag.exec(html))) depth += m[1] ? -1 : 1
  if (depth) throw new Error(`<section id="${section}"> is not closed`)
  const body = html.slice(open.index, m.index)

  const productions = []
  for (const [, row] of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)]
    if (cells.length != 4 || !/\bid="(prod|term)-[^"]+"/.test(cells[0][1])) continue
    const number = /<span class="prodNo">([\s\S]*?)<\/span>/.exec(cells[0][2])
    productions.push({
      number: number ? cellText(number[1]).join(" ") : "",
      name: cellText(cells[1][2]).join(" "),
      lines: cellText(cells[3][2]),
    })
  }
  if (!productions.length) throw new Error(`no productions in <section id="${section}">`)
  return productions
}

/// The productions as the lines of the .ebnf file: `[number] name ::= first line`, further
/// lines of the right-hand side indented.
export function formatGrammar(productions) {
  return productions.map(({number, name, lines}) => [`[${number}] ${name} ::= ${lines[0]}`, ...lines.slice(1).map(line => `    ${line}`)].join("\n"))
}

if (process.argv[1] == fileURLToPath(import.meta.url)) {
  const source = readSource()
  const [url, sha256, section, grammar] = ["url", "sha256", "section", "grammar"].map(key => {
    if (!source.get(key)) throw new Error(`spec/SOURCE has no ${key}`)
    return source.get(key)
  })
  let bytes
  if (process.argv[2]) {
    bytes = readFileSync(process.argv[2])
  } else {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`)
    bytes = Buffer.from(await response.arrayBuffer())
  }
  const actual = createHash("sha256").update(bytes).digest("hex")
  if (actual != sha256) throw new Error(`sha256 of ${process.argv[2] ?? url} is ${actual}, spec/SOURCE pins ${sha256}`)
  const header = [
    `# Extracted by gen/fetch.mjs from ${url}, <section id="${section}">, sha256 ${sha256}.`,
    "# Do not edit: deviations go in spec/deviations.ebnf. Notation: spec/README.md.",
    "",
  ]
  writeFileSync(specFile(grammar), [...header, ...formatGrammar(extractGrammar(bytes.toString("utf8"), section)), ""].join("\n"))
}
