'use strict';
/* Локальный запуск без аккаунтов: встроенная база в .data/, статика из public/.
   Учетные записи для входа создаются при первом запуске и лежат в .data/dev-credentials.txt */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pgliteDb } = require('./db');
const { createApp } = require('./app');
const { hashPassword } = require('./security');

const PORT = Number(process.env.PORT || 4180);
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, '.data');
const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const HEADERS = Object.fromEntries(VERCEL.headers[0].headers.map((h) => [h.key, h.value]));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };

async function main() {
  fs.mkdirSync(DATA, { recursive: true });
  const secretFile = path.join(DATA, 'signing-secret');
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'));

  const db = await pgliteDb(path.join(DATA, 'pglite'));
  await db.migrate();
  const [{ count }] = await db.query('select count(*)::int as count from users');
  if (!count) {
    const accounts = [['manager@local.test', 'Руководитель (локально)', 'manager'], ['analyst@local.test', 'Аналитик (локально)', 'analyst']];
    const lines = [];
    for (const [email, name, role] of accounts) {
      const password = crypto.randomBytes(9).toString('base64url');
      await db.query('insert into users (email, name, role, password_hash) values ($1, $2, $3, $4)', [email, name, role, await hashPassword(password)]);
      lines.push(`${email}  ${password}  ${role}`);
    }
    fs.writeFileSync(path.join(DATA, 'dev-credentials.txt'), `${lines.join('\n')}\n`);
    console.log('Созданы локальные учетные записи: .data/dev-credentials.txt');
  }

  const api = createApp({
    db,
    signingSecret: fs.readFileSync(secretFile, 'utf8').trim(),
    publicUrl: process.env.PUBLIC_URL || `http://localhost:${PORT}`,
    secureCookies: false,
  });

  http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    if (pathname.startsWith('/api/')) return api(req, res);
    let rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (pathname === '/verify' || pathname.startsWith('/v/')) rel = 'verify.html';
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, HEADERS);
      return res.end('Not found');
    }
    res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  }).listen(PORT, () => console.log(`http://localhost:${PORT}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
