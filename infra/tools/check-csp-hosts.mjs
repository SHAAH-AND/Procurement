#!/usr/bin/env node
// Asserts that the CSP in each HTML page still permits every host the app
// genuinely needs. Runs offline, in milliseconds, against the source.
//
// Why: the CSP shipped in v31 allowed https://*.zoho.com but NOT
// accounts.zohoportal.com — a different registrable domain — which is where
// the Catalyst SDK mints its auth token. Every signed-in user got a boot
// screen that never finished. The headless CSP test passed anyway, because it
// only loaded the page: signed out, the SDK rejects before requesting a token,
// so the blocked fetch never happened.
//
// A wildcard is easy to misread as covering more than it does. This file makes
// the requirement explicit and checkable: each host is listed with the reason
// it exists, so removing one is a decision rather than an accident.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'procurement_web');

// host, directive, reason, and which pages must allow it.
const REQUIRED = [
  { host: 'https://accounts.zohoportal.com', directive: 'connect-src',
    reason: 'Catalyst SDK mints the auth token here. Blocking it hangs boot for every signed-in user.',
    pages: ['index.html', 'developer.html'] },
  { host: 'https://static.zohocdn.com', directive: 'script-src',
    reason: 'Serves catalystWebSDK.js.',
    pages: ['index.html', 'developer.html'] },
  { host: 'https://fonts.googleapis.com', directive: 'style-src',
    reason: 'Inter webfont stylesheet.',
    pages: ['index.html', 'developer.html', 'vendor_portal.html'] },
  { host: 'https://fonts.gstatic.com', directive: 'font-src',
    reason: 'Inter webfont files.',
    pages: ['index.html', 'developer.html', 'vendor_portal.html'] },
  { host: 'https://procurement-x.zohostratus.com', directive: 'connect-src',
    reason: 'Stratus bucket for attachment upload/download.',
    pages: ['index.html', 'vendor_portal.html'] },
  { host: 'https://procurement.cloudhub.lk', directive: 'connect-src',
    reason: 'The mapped custom domain the app is served from.',
    pages: ['index.html', 'developer.html', 'vendor_portal.html'] }
];

function policyOf(html) {
  const m = html.match(/http-equiv=["']Content-Security-Policy["']\s+content="([^"]+)"/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

function sourcesFor(policy, directive) {
  const found = policy.split(';').map(s => s.trim())
    .find(s => s.toLowerCase().startsWith(directive.toLowerCase() + ' '));
  if (found) return found.split(/\s+/).slice(1);
  const dflt = policy.split(';').map(s => s.trim())
    .find(s => s.toLowerCase().startsWith('default-src '));
  return dflt ? dflt.split(/\s+/).slice(1) : [];
}

// CSP host matching: an exact origin, or a *.domain wildcard covering exactly
// one label. https://*.zoho.com does NOT match accounts.zohoportal.com — the
// precise reason the bug existed.
function allows(sources, url) {
  const u = new URL(url);
  return sources.some(src => {
    if (src === '*' || src === "'self'") return false; // 'self' handled by caller context
    let s = src;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    let parsed; try { parsed = new URL(s); } catch { return false; }
    if (parsed.hostname.startsWith('*.')) {
      const suffix = parsed.hostname.slice(1); // ".zoho.com"
      return u.hostname.endsWith(suffix) && u.hostname.length > suffix.length;
    }
    return parsed.hostname === u.hostname;
  });
}

let failures = 0;
const pages = [...new Set(REQUIRED.flatMap(r => r.pages))];
const policies = {};
for (const p of pages) {
  const file = path.join(WEB, p);
  const policy = policyOf(fs.readFileSync(file, 'utf8'));
  if (!policy) { console.log(`✗ ${p}: no Content-Security-Policy meta tag found`); failures++; continue; }
  policies[p] = policy;
}

console.log('CSP required-host check');
console.log('='.repeat(64));
for (const req of REQUIRED) {
  for (const page of req.pages) {
    const policy = policies[page];
    if (!policy) continue;
    const srcs = sourcesFor(policy, req.directive);
    const ok = allows(srcs, req.host);
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} ${page.padEnd(19)} ${req.directive.padEnd(12)} ${req.host}`);
    if (!ok) {
      console.log(`     WHY IT MATTERS: ${req.reason}`);
      console.log(`     current ${req.directive}: ${srcs.join(' ') || '(none)'}`);
    }
  }
}

console.log('='.repeat(64));
console.log(failures === 0
  ? 'PASS — every host the app depends on is permitted by the policy.'
  : `FAIL — ${failures} required host(s) blocked. Signed-in users may hang on boot.`);
process.exit(failures === 0 ? 0 : 1);
