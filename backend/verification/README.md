# Verification suite

Run this before every deploy:

```bash
bash verification/verify.sh
```

Exit code 0 means safe to deploy. Anything else means stop.

Needs Node 18+, `ws` (`npm i ws`), and Google Chrome. It never touches the live
datastore — the Catalyst SDK is stubbed and the browser tests run against a
local static server.

## The twelve stages

| # | Stage | What it would have caught |
|---|---|---|
| 1 | Syntax of every shipped `.js` | A literal newline inside a JS string killed the whole module graph — infinite spinner, zero API calls |
| 2 | Named imports resolve to real exports | A missing export kills the graph the same way |
| 3 | Frontend reads only real DB columns | 8 invented fields rendered as a silent "—" and passed every other check |
| 4 | DOM ids the JS requires exist in the HTML | `wireModalChrome()` threw on a page missing `#modal-close` |
| 5 | Components render in real Chrome | Parsing proves nothing about behaviour |
| 6 | Pack matches the customer workbook, and is wired up | Includes cache-bust drift: one stale `?v=` means two module instances and two separate `state` objects, so the item picker silently reads an empty catalogue |
| 7 | Classification cascade behaves in a browser | Department → category → sub-category leaking across departments |
| 8 | Backend handlers actually **run** | Two identifiers that do not exist (`PUBLIC_ORIGIN`, `authUser.name`) sat in a live handler while stages 1–7 were green |
| 9 | Security: auth gate, headers, error leakage | An endpoint added outside the auth middleware |
| 10 | First-run onboarding seeds the real structure | A wrong role ladder makes every approval wrong from row one |
| 11 | All three approval routes walk end-to-end | A non-budgeted request reaching a PO without the Board |
| 12 | The real `index.html` boots in a browser | The production symptom itself: app stuck on the spinner |

## The rule

After writing any check, **deliberately break the thing it watches and confirm
it fails.** A check that cannot fail is worse than no check, because it buys
false confidence.

This suite exists because `node --check "$f" | head -1; echo " ok"` printed
"ok" unconditionally — the pipe discarded the exit code — and reported "all
parse OK" fourteen times while a fatal syntax error sat in the file.

## Note on the browser stages

Stages 5, 7 and 12 launch Chrome on a randomised debug port. A fixed port lets
an orphaned Chrome from an earlier run get attached to instead, which silently
drives a **stale page** and produces failures unrelated to your code. If browser
stages fail inexplicably, check for leftover processes:

```bash
tasklist //FI "IMAGENAME eq chrome.exe"   # Windows
taskkill //F //IM chrome.exe
```
