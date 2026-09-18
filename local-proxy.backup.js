// Local proxy for ProcureFlow real app
// Serves procurement_web statically and proxies /server/procurement_api -> deployed Catalyst
// Option A: live data from cloud. No build step, no Catalyst CLI needed.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5174;
const WEB_DIR = path.join(__dirname, 'procurement_web');
const TARGET = 'https://procurement-932021889.development.catalystserverless.com';

const MIME = {
  '.html':'text/html; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.svg':'image/svg+xml',
  '.ico':'image/x-icon',
  '.woff':'font/woff',
  '.woff2':'font/woff2',
  '.ttf':'font/ttf',
  '.map':'application/json'
};

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback: serve index.html for unknown routes (not API)
    filePath = path.join(WEB_DIR, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(filePath).pipe(res);
}

// ---- DEV BYPASS: let localhost view the app without a Zoho invite ----
// Visit http://localhost:5174/?dev=1  to auto-enter the app as a mock user.
// This only intercepts the auth gates; all other /api/* still proxy to live Catalyst.
const DEV_ORG = {
  ROWID: 'dev-org-1', Name: 'Galle Face Hotel Group (LOCAL DEV)', Status: 'Active',
  Settings: JSON.stringify({ currency: 'LKR', multiProperty: true, logoDataUri: '', capabilities: { rfqs:true, receipts:true, recurringBills:true, vendorCredits:true, budgets:true, customModules:true } }),
  capabilities: { rfqs:true, receipts:true, recurringBills:true, vendorCredits:true, budgets:true, customModules:true }
};
const DEV_USER = { ROWID: 'dev-user-1', FullName: 'Nadhir Noori (Dev)', Email: 'test@procureflow.local', Role: 'Admin', Status: 'Active' };
function sendJson(res, obj, status=200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const authHeader = req.headers['authorization'] || '';
  const isDev = url.searchParams.get('dev') === '1' || req.headers['x-dev-bypass'] === '1' || req.headers.cookie?.includes('pf_dev=1') || authHeader === 'dev-bypass' || req.headers['referer']?.includes('?dev=1');

  // Dev bypass endpoints - answer directly without hitting Catalyst
  if (isDev && req.url.includes('/api/sync-user')) {
    // consume body if any
    req.on('data', ()=>{}); req.on('end', ()=>{
      sendJson(res, { user: DEV_USER, setupRequired: false, notice: 'DEV MODE: mock user - viewing app structure (no live data). Remove ?dev=1 to use real login.' });
    });
    return;
  }
  if (isDev && req.url.includes('/api/organizations')) {
    sendJson(res, [DEV_ORG]); return;
  }
  if (isDev && req.url.includes('/api/health')) {
    // still proxy health but add dev flag
    sendJson(res, { ok:true, service:'procurement_api', version:'4.1.2-dev-bypass', time: new Date().toISOString() }); return;
  }
  // In dev mode, mock all data APIs so pages render (sidebar, lists) instead of 401
  if (isDev && req.url.includes('/api/')) {
    // let sync/org/health above handle, else return empty array/object for lists
    const path = url.pathname;
    if (path.includes('/api/reference')) return sendJson(res, { categories: [], uoms: [], expenditureClasses: [] });
    if (path.includes('/api/items') || path.includes('/api/suppliers') || path.includes('/api/users') || path.includes('/api/roles') || path.includes('/api/properties') || path.includes('/api/budgets') || path.includes('/api/pos') || path.includes('/api/prs') || path.includes('/api/rfqs')) {
      return sendJson(res, []);
    }
    if (path.includes('/api/')) return sendJson(res, []);
  }

  // Proxy Catalyst SDK init + API to deployed Catalyst (needed for Zoho login widget locally)
  const isProxy = req.url.startsWith('/server/procurement_api') || req.url.startsWith('/__catalyst');
  if (isProxy) {
    const targetUrl = TARGET + req.url;
    try {
      const headers = { ...req.headers };
      // Host must be target, not localhost
      headers.host = 'procurement-932021889.development.catalystserverless.com';
      // Remove hop-by-hop
      delete headers['connection'];
      delete headers['content-length'];

      const body = await new Promise(resolve => {
        if (req.method === 'GET' || req.method === 'HEAD') return resolve(undefined);
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
      });

      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body,
        redirect: 'manual'
      });

      res.statusCode = upstream.status;
      upstream.headers.forEach((v, k) => {
        // Skip hop headers, but keep cookies
        if (k === 'content-encoding' || k === 'content-length' || k === 'transfer-encoding') return;
        res.setHeader(k, v);
      });
      // CORS for local dev
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');

      const buf = Buffer.from(await upstream.arrayBuffer());
      res.end(buf);
    } catch (e) {
      console.error('Proxy error', req.url, e.message);
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Proxy to Catalyst failed: ' + e.message }));
    }
    return;
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.statusCode = 204;
    res.end();
    return;
  }

  // Static serve
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/' ) urlPath = '/index.html';
  // Prevent path traversal - strip leading / so path.join doesn't treat as absolute
  const safePath = decodeURIComponent(urlPath).replace(/^\/+/, '');
  let filePath = path.join(WEB_DIR, safePath);
  if (!filePath.startsWith(WEB_DIR)) filePath = path.join(WEB_DIR, 'index.html');
  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`ProcureFlow local proxy running`);
  console.log(`  App:    http://localhost:${PORT}`);
  console.log(`  Proxies /server/procurement_api + /__catalyst -> ${TARGET}`);
  console.log(`  Health test: http://localhost:${PORT}/server/procurement_api/api/health`);
});
