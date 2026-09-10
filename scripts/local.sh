#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null 2>&1; then
  export PATH="/Users/heitorgarcia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
fi
case "${1:-start}" in
  start) exec node src/server.js ;;
  check) exec node scripts/check.mjs ;;
  test) exec node --test test/*.test.js ;;
  setup) exec node scripts/setup.mjs ;;
  setup-scim) exec node scripts/setup-scim.mjs ;;
  create-ana) exec node scripts/create-ana.mjs ;;
  link-user) shift; exec node scripts/link-identity.mjs "$@" ;;
  *) echo 'Use start, check, test, setup, setup-scim or create-ana'; exit 1 ;;
esac
