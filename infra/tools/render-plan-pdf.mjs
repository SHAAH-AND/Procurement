import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const input = path.join(root, 'GALLE_FACE_HOTEL_PROJECT_AND_DEPLOYMENT_PLAN.md');
const output = path.join(root, 'Galle_Face_Hotel_ProcureFlow_Project_and_Deployment_Plan.pdf');

const clean = value => value
  .replace(/\*\*/g, '')
  .replace(/`/g, '')
  .replace(/[→]/g, '->')
  .replace(/[–—]/g, '-')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[^\x20-\x7e]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function wrap(text, limit) {
  const words = clean(text).split(' ');
  const lines = []; let line = '';
  for (const word of words) {
    if (!word) continue;
    if (line && `${line} ${word}`.length > limit) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

const pages = []; let ops = []; let y = 790; let pageNo = 0;
function esc(value) { return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function newPage() {
  if (ops.length) pages.push(ops.join('\n'));
  pageNo++; ops = [
    '0.024 0.231 0.345 rg',
    `BT /F2 9 Tf 42 812 Td (${esc('ProcureFlow | Galle Face Hotel Project and Deployment Plan')}) Tj ET`,
    '0.12 0.56 0.70 RG 42 805 m 553 805 l S',
    '0.32 0.37 0.41 rg',
    `BT /F1 8 Tf 42 24 Td (${esc(`Confidential client planning document | Page ${pageNo}`)}) Tj ET`
  ]; y = 785;
}
function line(text, kind = 'text') {
  const size = kind === 'title' ? 20 : kind === 'h1' ? 13 : kind === 'h2' ? 10.5 : kind === 'code' ? 8 : 9;
  const leading = kind === 'title' ? 25 : kind === 'h1' ? 17 : kind === 'h2' ? 14 : kind === 'code' ? 11 : 12;
  if (y - leading < 45) newPage();
  const font = ['title', 'h1', 'h2'].includes(kind) ? 'F2' : 'F1';
  const color = ['title', 'h1', 'h2'].includes(kind) ? '0.024 0.231 0.345 rg' : '0.09 0.13 0.17 rg';
  ops.push(`${color} BT /${font} ${size} Tf 42 ${y} Td (${esc(clean(text))}) Tj ET`);
  y -= leading;
}

newPage();
let inCode = false;
for (const raw of fs.readFileSync(input, 'utf8').replace(/\r/g, '').split('\n')) {
  if (raw.startsWith('```')) { inCode = !inCode; continue; }
  if (!raw.trim()) { y -= 4; continue; }
  if (raw.startsWith('# ')) { for (const part of wrap(raw.slice(2), 54)) line(part, 'title'); y -= 8; continue; }
  if (raw.startsWith('## ')) { for (const part of wrap(raw.slice(3), 75)) line(part, 'h1'); y -= 3; continue; }
  if (raw.startsWith('### ')) { for (const part of wrap(raw.slice(4), 85)) line(part, 'h2'); continue; }
  if (/^\|/.test(raw)) {
    const cells = raw.split('|').slice(1, -1).map(clean);
    if (cells.every(c => /^-+$/.test(c))) continue;
    const text = cells.join(' | ');
    for (const part of wrap(text, 104)) line(part, 'text');
    continue;
  }
  const bullet = raw.match(/^(\s*(?:[-*]|\d+\.))\s+(.*)$/);
  const prefix = bullet ? (bullet[1].trim().endsWith('.') ? bullet[1].trim() : '•') + ' ' : '';
  const text = bullet ? bullet[2] : raw;
  const kind = inCode ? 'code' : 'text';
  const parts = wrap(text, inCode ? 110 : (bullet ? 100 : 105));
  parts.forEach((part, index) => line(`${index ? '   ' : prefix}${part}`, kind));
}
if (ops.length) pages.push(ops.join('\n'));

const objects = [];
const add = body => { objects.push(body); return objects.length; };
const catalog = add('<< /Type /Catalog /Pages 2 0 R >>');
const pagesId = add('');
const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
const pageIds = [];
for (const stream of pages) {
  const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
  pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
}
objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offsets = [0];
objects.forEach((body, i) => { offsets.push(Buffer.byteLength(pdf, 'latin1')); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
const xref = Buffer.byteLength(pdf, 'latin1');
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
fs.writeFileSync(output, Buffer.from(pdf, 'latin1'));
console.log(`Created ${path.basename(output)} (${pages.length} pages, ${fs.statSync(output).size} bytes)`);
