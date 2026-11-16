#!/usr/bin/env bash
# Replaces fixtures/shexTest/ with the .shex files of schemas/, negativeSyntax/ and
# negativeStructure/ and the LICENSE of shexSpec/shexTest at the commit that
# fixtures/shexTest/SOURCE pins, and records the sha256 of the files in SOURCE.
# With the argument `sha256`, only prints that sha256 for the files as they are.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)/fixtures/shexTest"

tree_sha256() {
  find LICENSE schemas negativeSyntax negativeStructure -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1
}

if [ "${1:-}" = sha256 ]; then
  tree_sha256
  exit 0
fi

commit=$(sed -n 's/^commit: *//p' SOURCE)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "https://codeload.github.com/shexSpec/shexTest/tar.gz/$commit" | tar -xz -C "$tmp"
src=$tmp/shexTest-$commit

rm -rf schemas negativeSyntax negativeStructure LICENSE
cp "$src/LICENSE" LICENSE
for dir in schemas negativeSyntax negativeStructure; do
  (cd "$src" && find "$dir" -name '*.shex' -print0) | while IFS= read -r -d '' file; do
    mkdir -p "$(dirname "$file")"
    cp "$src/$file" "$file"
  done
done
sed -i "s/^sha256: .*/sha256:     $(tree_sha256)/" SOURCE
