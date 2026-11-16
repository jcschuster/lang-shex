#!/usr/bin/env bash
# Parses each .shex file of fixtures/shexTest with shex.js (@shexjs/parser). It must accept
# every file of schemas/ and reject every file of negativeSyntax/; of negativeStructure/ it
# must reject includeWithCardinality and includeWithLabel and accept the others, whose
# errors only validation finds. Prints one line per disagreement.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

node - <<'JS'
const fs = require("fs"), path = require("path"), url = require("url")
const {construct} = require("@shexjs/parser")
const root = "fixtures/shexTest"
const rejected = new Set(["negativeStructure/includeWithCardinality.shex", "negativeStructure/includeWithLabel.shex"])
let failed = 0
for (const dir of ["schemas", "negativeSyntax", "negativeStructure"]) {
  for (const file of fs.readdirSync(path.join(root, dir), {recursive: true}).filter(f => f.endsWith(".shex")).sort()) {
    const name = path.join(dir, file), full = path.resolve(root, name)
    let error = null
    try {
      construct(url.pathToFileURL(full).href, {}, {}).parse(fs.readFileSync(full, "utf8"))
    } catch (e) {
      error = String(e.message).split("\n")[0]
    }
    const expected = dir == "negativeSyntax" || rejected.has(name) ? "reject" : "accept"
    if ((error != null) != (expected == "reject")) {
      console.log(`shex.js should ${expected} ${name}${error ? `: ${error}` : ""}`)
      failed = 1
    }
  }
}
process.exitCode = failed
JS
