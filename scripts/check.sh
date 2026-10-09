#!/bin/sh
# Validates the marketplace, then validates and tests every mod under mods/<category>/<mod>.
set -e
cd "$(dirname "$0")/.."
claude plugin validate .
for mod in mods/*/*/; do
  [ -f "$mod.claude-plugin/plugin.json" ] || continue
  echo "== $mod"
  claude plugin validate "$mod"
  ls "$mod"tests/*.test.ts >/dev/null 2>&1 && claude plugin test "$mod"
done
