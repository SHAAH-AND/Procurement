#!/bin/bash
# Pre-deploy gate. Every check reports its own failure and sets the exit code.
#
# Written after a literal newline inside a JS string shipped to production and
# left the app on its spinner forever. node --check caught it; my loop printed
# "ok" unconditionally and swallowed the result. A check that cannot fail is
# worse than no check, because it buys false confidence.
set -uo pipefail
ROOT="C:/Users/MK/Documents/Procurement"
# Locate ourselves, so the suite runs from any checkout on any machine.
SCRATCH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fails=0
ok()   { printf '  \033[32mok\033[0m   %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '       %s\n' "$2"; fails=$((fails+1)); }

echo "═══ 1. Syntax (every shipped .js) ═══"
for f in "$ROOT"/functions/*/*.js "$ROOT"/procurement_web/js/*.js "$ROOT"/procurement_web/vendor.js; do
  if out=$(node --check "$f" 2>&1); then
    ok "$(basename "$f")"
  else
    bad "$(basename "$f")" "$(echo "$out" | sed -n '2,4p' | tr '\n' ' ')"
  fi
done

echo
echo "═══ 2. Named imports resolve to real exports ═══"
if out=$(node "$SCRATCH/exportcheck.mjs" 2>&1); then ok "every import resolves"; else bad "broken imports" "$(echo "$out"|tail -3|tr '\n' ' ')"; fi

echo
echo "═══ 3. Frontend reads only real columns ═══"
if out=$(node "$SCRATCH/schemacheck.mjs" 2>&1); then ok "no phantom fields"; else bad "phantom fields" "$(echo "$out"|grep '✗'|tr '\n' ' ')"; fi

echo
echo "═══ 4. DOM ids the JS requires exist in the HTML ═══"
node - <<'NODE'
const fs=require('fs');
const WEB='C:/Users/MK/Documents/Procurement/procurement_web/';
const jsFiles=fs.readdirSync(WEB+'js').filter(f=>f.endsWith('.js'));

// Most ids are injected at runtime by a template string somewhere in the JS.
// Only an id that NOTHING ever creates is a real problem — that is the class
// of bug that killed the admin console (#modal-close, #page-root).
const created=new Set();
for (const f of jsFiles){
  const src=fs.readFileSync(WEB+'js/'+f,'utf8');
  for (const m of src.matchAll(/id="([^"${}]+)"/g)) created.add(m[1]);
  for (const m of src.matchAll(/\.id\s*=\s*'([^']+)'/g)) created.add(m[1]);
}

const pairs=[['index.html',['main.js','ui.js','api.js','views-p2p.js','views-admin.js','documents.js','tour.js']]];
let bad=0;
for (const [html,mods] of pairs){
  const page=fs.readFileSync(WEB+html,'utf8');
  const ids=new Set([...page.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
  const missing=new Set();
  for (const mod of mods){
    const src=fs.readFileSync(WEB+'js/'+mod,'utf8');
    for (const m of src.matchAll(/getElementById\('([^']+)'\)/g)){
      if(!ids.has(m[1]) && !created.has(m[1])) missing.add(`${m[1]} (${mod})`);
    }
  }
  if (missing.size){ console.log(`  [31mFAIL[0m ${html}`); [...missing].forEach(x=>console.log('       nothing creates #'+x)); bad++; }
  else console.log(`  [32mok[0m   ${html}`);
}
process.exit(bad?1:0);
NODE
[ $? -ne 0 ] && fails=$((fails+1))

echo
echo "═══ 5. Components render in a real browser ═══"
if out=$(cd "$SCRATCH" && node uitest.mjs 2>&1); then
  ok "$(echo "$out" | grep -oE 'passed: [0-9]+' | head -1) assertions"
else
  bad "UI harness" "$(echo "$out"|grep FAIL|head -3|tr '\n' ' ')"
fi

echo
echo "═══ 6. Hotel pack matches the customer workbook, and is wired up ═══"
if out=$(node "$SCRATCH/packcheck.mjs" 2>&1); then
  ok "$(echo "$out" | grep -oE 'passed: [0-9]+' | head -1) assertions"
else
  bad "pack/wiring" "$(echo "$out"|grep FAIL|head -4|tr '\n' ' ')"
fi

echo
echo "═══ 7. Classification cascade behaves in a browser ═══"
if out=$(cd "$SCRATCH" && node cascadetest.mjs 2>&1); then
  ok "$(echo "$out" | grep -oE 'passed: [0-9]+' | head -1) assertions"
else
  bad "cascade" "$(echo "$out"|grep FAIL|head -4|tr '\n' ' ')"
fi

echo
echo "═══ 8. Backend handlers actually RUN (not just parse) ═══"
if out=$(cd "$SCRATCH" && node apitest.mjs 2>&1); then
  ok "$(echo "$out" | grep -oE 'passed: [0-9]+' | head -1) assertions"
else
  bad "handler execution" "$(echo "$out"|grep -E 'FAIL|Error'|head -4|tr '\n' ' ')"
fi

echo
echo "═══ 9. Security: auth gate, headers, error leakage ═══"
if out=$(cd "$SCRATCH" && node sectest.mjs 2>&1); then
  ok "$(echo "$out" | grep -oE 'passed: [0-9]+' | head -1) assertions"
else
  bad "security" "$(echo "$out"|grep FAIL|head -4|tr '\n' ' ')"
fi

echo
echo "═══ 10. First-run onboarding seeds the customer's structure ═══"
if out=$(cd "$SCRATCH" && node onboardtest.mjs 2>&1); then
  ok "$(echo "$out" | grep -oE 'passed: [0-9]+' | head -1) assertions"
else
  bad "onboarding" "$(echo "$out"|grep FAIL|head -4|tr '\n' ' ')"
fi

echo
echo "═══ 11. All three approval routes walk end-to-end ═══"
if out=$(cd "$SCRATCH" && node workflowtest.mjs 2>&1); then
  ok "$(echo "$out" | grep -oE 'passed: [0-9]+' | head -1) assertions"
else
  bad "approval routing" "$(echo "$out"|grep FAIL|head -4|tr '\n' ' ')"
fi

echo
echo "═══ 12. The real index.html boots in a browser ═══"
if out=$(cd "$SCRATCH" && node boottest.mjs 2>&1); then
  ok "$(echo "$out" | grep -oE 'passed: [0-9]+' | head -1) assertions"
else
  bad "boot" "$(echo "$out"|grep FAIL|head -4|tr '\n' ' ')"
fi

echo
echo "═══ 13. Public signup is denied unless an admin approved ═══"
if out=$(cd "$SCRATCH" && node signuptest.mjs 2>&1); then
  ok "$(echo "$out" | grep -oE 'passed: [0-9]+' | head -1) assertions"
else
  bad "signup gate" "$(echo "$out"|grep -E '^  - '|head -4|tr '\n' ' ')"
fi

echo
echo "═══ 14. Approval links are single-use and expiring ═══"
if out=$(cd "$SCRATCH" && node decisiontest.mjs 2>&1); then
  ok "$(echo "$out" | grep -oE 'passed: [0-9]+' | head -1) assertions"
else
  bad "signup decisions" "$(echo "$out"|grep -E '^  - '|head -4|tr '\n' ' ')"
fi

echo
echo "═══ 15. Theme defaults and persistence ═══"
if out=$(cd "$SCRATCH" && node themetest.mjs 2>&1); then
  ok "light first visit; explicit dark persists"
else
  bad "theme contract" "$(echo "$out"|grep FAIL|head -3|tr '\n' ' ')"
fi

echo
echo "════════════════════════════════════"
if [ $fails -eq 0 ]; then echo "  ALL GREEN — safe to deploy"; else echo "  $fails CHECK(S) FAILED — do not deploy"; fi
exit $fails
