// Connectivity check against the LIVE deployed Catalyst function.
const BASE = 'https://procurement-932021889.development.catalystserverless.com';
const API = `${BASE}/server/procurement_api`;

const probes = [
  ['Slate app (frontend)',      `${BASE}/app/index.html`,        [200]],
  ['Vendor portal page',        `${BASE}/app/vendor_portal.html`,[200]],
  ['Developer portal page',     `${BASE}/app/developer.html`,    [200]],
  ['Health probe (NEW)',        `${API}/api/health`,             [200, 401]],
  ['Protected: organizations',  `${API}/api/organizations`,      [401]],
  ['Protected: developer stats',`${API}/api/developer/stats`,    [401]],
  ['Vendor auth surface',       `${API}/api/vendor-portal/me`,   [401, 403, 404]]
];

console.log(`Target: ${BASE}\n`);
let deployedHealth = false;
for (const [label, url, okCodes] of probes) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const ms = Date.now() - t0;
    const good = okCodes.includes(res.status);
    let extra = '';
    if (url.endsWith('/api/health')) {
      if (res.status === 200) {
        const j = await res.json().catch(() => null);
        if (j?.ok) { deployedHealth = true; extra = `  → v${j.version} @ ${j.time}`; }
      } else {
        extra = '  → not deployed yet (expected until you run catalyst deploy)';
      }
    }
    console.log(`${good ? '✓' : '✗'} ${label.padEnd(28)} ${String(res.status).padEnd(4)} ${String(ms).padStart(5)}ms${extra}`);
  } catch (e) {
    console.log(`✗ ${label.padEnd(28)} ERR  ${e.message}`);
  }
}

console.log(`\nHealth endpoint live: ${deployedHealth ? 'YES' : 'NO — deploy required'}`);
console.log('\n401 on protected routes is the CORRECT result from this script:');
console.log('it proves the function is deployed, running, and refusing unauthenticated');
console.log('requests. A 404 or a connection error would be the failure signal.');
