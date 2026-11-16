#!/usr/bin/env bash
# Prints the URL of the ShEx specification that https://shex.io/shex-semantics/ serves: the
# dated report the symlink www/shex-semantics of shexSpec/shex.io points to.
set -euo pipefail

target=$(curl -fsSL https://raw.githubusercontent.com/shexSpec/shex.io/master/www/shex-semantics)
if ! [[ $target =~ ^shex-semantics-[0-9]{8}$ ]]; then
  echo "unexpected target of www/shex-semantics in shexSpec/shex.io: $target" >&2
  exit 1
fi
echo "https://shex.io/$target/"
