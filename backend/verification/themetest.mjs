// A first visit must always start in the product's light theme. Dark remains an
// explicit, persisted preference instead of silently following the operating
// system and surprising users on shared procurement workstations.
let stored = {};
globalThis.localStorage = {
  getItem: key => stored[key] ?? null,
  setItem: (key, value) => { stored[key] = String(value); }
};
globalThis.window = {
  matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} })
};
const attrs = {};
globalThis.document = {
  documentElement: { setAttribute: (key, value) => { attrs[key] = value; } }
};

const { applyStoredTheme } = await import('../procurement_web/js/ui.js?theme-contract=1');

const first = applyStoredTheme();
if (first !== 'light' || attrs['data-theme'] !== 'light') {
  console.error(`FAIL first visit must be light; got ${first}`);
  process.exit(1);
}

stored['pf-theme'] = 'dark';
const explicit = applyStoredTheme();
if (explicit !== 'dark' || attrs['data-theme'] !== 'dark') {
  console.error(`FAIL stored dark preference must win; got ${explicit}`);
  process.exit(1);
}

console.log('PASS first visit is light and explicit dark preference persists');
