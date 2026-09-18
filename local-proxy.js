// Local proxy for ProcureFlow — serves frontend/dist at root + proxies /api/* to Catalyst
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5174;
const WEB_DIR = path.join(__dirname, 'frontend', 'dist');
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
    filePath = path.join(WEB_DIR, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

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

  // Proxy /api/* to local Nest backend (where demo lives), and /server/* to Catalyst cloud
  if (req.url.startsWith('/api/')) {
    const targetUrl = 'http://localhost:3000' + req.url;
    try {
      const headers = { ...req.headers };
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
        redirect: 'manual',
      });
      res.statusCode = upstream.status;
      upstream.headers.forEach((v, k) => {
        if (k === 'content-encoding' || k === 'content-length' || k === 'transfer-encoding') return;
        res.setHeader(k, v);
      });
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.end(buf);
    } catch (e) {
      console.error('API proxy error', req.url, e.message);
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Backend proxy failed: ' + e.message }));
    }
    return;
  }

  // Proxy all /server/procurement_api/* and /__catalyst to Catalyst cloud
  if (req.url.startsWith('/server/procurement_api') || req.url.startsWith('/__catalyst')) {
    const targetUrl = TARGET + req.url;
    try {
      const headers = { ...req.headers };
      headers.host = 'procurement-932021889.development.catalystserverless.com';
      delete headers['connection'];
      delete headers['content-length'];
      const body = await new Promise(resolve => {
        if (req.method === 'GET' || req.method === 'HEAD') return resolve(undefined);
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
      });
      const upstream = await fetch(targetUrl, { method: req.method, headers, body, redirect: 'manual' });
      res.statusCode = upstream.status;
      upstream.headers.forEach((v, k) => {
        if (k === 'content-encoding' || k === 'content-length' || k === 'transfer-encoding') return;
        res.setHeader(k, v);
      });
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.end(buf);
    } catch (e) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Proxy to Catalyst failed: ' + e.message }));
    }
    return;
  }

  // Serve frontend/dist at root (React SPA)
  if (url.pathname === '/' || url.pathname === '/index.html') {
    serveFile(res, path.join(WEB_DIR, 'index.html'));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    let fp = path.join(WEB_DIR, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
    if (fp.startsWith(WEB_DIR) && fs.existsSync(fp) && !fs.statSync(fp).isDirectory()) {
      serveFile(res, fp);
      return;
    }
  }
  // SPA fallback: serve index.html for all other routes
  serveFile(res, path.join(WEB_DIR, 'index.html'));
});

server.listen(PORT, () => {
  console.log('ProcureFlow local proxy running');
  console.log('  App:    http://localhost:' + PORT);
  console.log('  Proxy:  /server/procurement_api + /__catalyst -> ' + TARGET);
});
