#!/usr/bin/env bash
# Runs every check in the repository, keeps going past a failure, and ends with one
# `PASS name` or `FAIL name` line per check (`SKIP` for a linter that is not installed).
# Exits non-zero if any failed. Expects the devshell (`nix develop`):
#
#     .github/scripts/test-all.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

results=()
failed=0

check() {
  local name=$1
  shift
  echo "== $name"
  if "$@"; then
    results+=("PASS $name")
  else
    results+=("FAIL $name")
    failed=1
  fi
}

# Runs a command that writes into the given directories, and fails if it changed them.
# shellcheck disable=SC2329 # called through check
unchanged_by() {
  local before
  before=$(mktemp -d)
  local dirs=()
  while [ "$1" != -- ]; do
    dirs+=("$1")
    mkdir -p "$before/$1" && cp -r "$1/." "$before/$1"
    shift
  done
  shift
  "$@" || return 1
  for dir in "${dirs[@]}"; do diff -r "$before/$dir" "$dir" || return 1; done
}

# shellcheck disable=SC2329 # called through check
fixtures_recorded() {
  [ "$(.github/scripts/fetch-fixtures.sh sha256)" = "$(sed -n 's/^sha256: *//p' fixtures/shexTest/SOURCE)" ]
}

check "LICENSE and NOTICE copies match" bash -c \
  'cmp LICENSE packages/codemirror-lang-shex/LICENSE && cmp NOTICE packages/codemirror-lang-shex/NOTICE'
check "pnpm install" pnpm install --frozen-lockfile
check "generated files are current" unchanged_by packages/codemirror-lang-shex/src -- pnpm generate
check "fixtures are the files fixtures/shexTest/SOURCE records" fixtures_recorded
check "shex.js accepts and rejects the fixtures as expected" .github/scripts/check-fixtures.sh
check "pnpm build" pnpm build
check "pnpm test" pnpm test
# In the devshell; elsewhere they may be missing.
if command -v shellcheck >/dev/null; then check shellcheck shellcheck .github/scripts/*.sh; else results+=("SKIP shellcheck: not installed"); fi
if command -v actionlint >/dev/null; then check actionlint actionlint; else results+=("SKIP actionlint: not installed"); fi

echo
printf '%s\n' "${results[@]}"
exit "$failed"
