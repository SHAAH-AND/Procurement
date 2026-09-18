#!/bin/bash
# Pre-deploy gate. Every check reports its own failure and sets the exit code.
#
# A check that cannot fail is worse than no check, because it buys false
# confidence — so each suite is run on its own and its exit code is honoured.
set -uo pipefail
SCRATCH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRATCH/.." && pwd)"
fails=0
ok()   { printf '  \033[32mok\033[0m   %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '       %s\n' "$2"; fails=$((fails+1)); }
suite() { # name file
  if out=$(cd "$SCRATCH" && node "$2" 2>&1); then
    ok "$1 — $(echo "$out" | grep -oE 'passed: [0-9]+' | tail -1 | sed 's/passed: //') assertions"
  else
    bad "$1" "$(echo "$out" | grep -E 'FAIL|Error' | head -4 | tr '\n' ' ')"
  fi
}

echo "═══ 1. Syntax (every shipped function file) ═══"
for f in "$ROOT"/functions/*/*.js "$ROOT"/functions/procurement_api/v1/*.js; do
  if out=$(node --check "$f" 2>&1); then ok "$(basename "$(dirname "$f")")/$(basename "$f")"
  else bad "$(basename "$f")" "$(echo "$out" | sed -n '2,4p' | tr '\n' ' ')"; fi
done

echo
echo "═══ 2. Hotel pack matches the customer workbook, and is wired up ═══"
suite "pack/wiring" packcheck.mjs

echo
echo "═══ 3. Legacy backend handlers actually RUN (not just parse) ═══"
suite "handler execution" apitest.mjs

echo
echo "═══ 4. /api/v1 — the React client's contract, end to end ═══"
suite "v1 procure-to-pay" v1test.mjs

echo
echo "═══ 5. Security: auth gate, headers, error leakage ═══"
suite "security" sectest.mjs

echo
echo "═══ 6. First-run onboarding seeds the customer's structure ═══"
suite "onboarding" onboardtest.mjs

echo
echo "═══ 7. All three approval routes walk end-to-end ═══"
suite "approval routing" workflowtest.mjs

echo
echo "═══ 8. Public signup is denied unless an admin approved ═══"
suite "signup gate" signuptest.mjs

echo
echo "═══ 9. Approval links are single-use and expiring ═══"
suite "signup decisions" decisiontest.mjs

echo
echo "═══ 10. React client type-checks and builds ═══"
if out=$(cd "$ROOT/frontend" && npx tsc -b 2>&1); then ok "tsc"; else bad "tsc" "$(echo "$out" | head -3 | tr '\n' ' ')"; fi
if out=$(cd "$ROOT/frontend" && npx vite build 2>&1); then
  ok "vite build ($(ls "$ROOT/frontend/dist/assets" | grep -c . ) assets)"
  # The build must be rooted at /app and carry the Catalyst client manifest.
  grep -q 'src="/app/assets/' "$ROOT/frontend/dist/index.html" && ok "assets rooted at /app" || bad "assets not rooted at /app"
  grep -q '/__catalyst/sdk/init.js' "$ROOT/frontend/dist/index.html" && ok "Catalyst SDK bootstrap present" || bad "Catalyst SDK bootstrap missing"
  [ -f "$ROOT/frontend/dist/client-package.json" ] && ok "client-package.json in dist" || bad "client-package.json missing from dist"
  ! grep -rq '"/img/' "$ROOT/frontend/dist/assets"/*.js && ok "no un-rooted /img/ references" || bad "un-rooted /img/ reference in bundle"
else
  bad "vite build" "$(echo "$out" | grep -iE 'error' | head -3 | tr '\n' ' ')"
fi

echo
echo "════════════════════════════════════"
if [ $fails -eq 0 ]; then echo "  ALL GREEN — safe to deploy"; else echo "  $fails CHECK(S) FAILED — do not deploy"; fi
exit $fails
