'use strict';
const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [kind, N, salt, hash] = String(stored).split('$');
  if (kind !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { ...SCRYPT, N: Number(N) });
  return crypto.timingSafeEqual(actual, expected);
}

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

/* Ключи объекта сортируются на всех уровнях: одинаковые данные дают одинаковую подпись */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/* Алфавит Крокфорда: без букв I, L, O, U, которые легко спутать при ручном вводе */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/* Контрольный код: первые 60 бит HMAC-SHA256 по содержимому редакции.
   Без секрета с сервера подделать код или подогнать под него данные нельзя. */
function signRevision(secret, { number, version, data, attachments }) {
  const payload = canonical({ number, version, data, attachments: attachments.map((a) => a.sha256) });
  const mac = crypto.createHmac('sha256', secret).update(payload).digest();
  let bits = 0n;
  for (const byte of mac.subarray(0, 8)) bits = (bits << 8n) | BigInt(byte);
  bits >>= 4n;
  let out = '';
  for (let i = 0; i < 12; i++) {
    out = CROCKFORD[Number(bits & 31n)] + out;
    bits >>= 5n;
  }
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

function normalizeCode(code) {
  const s = String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1');
  return s.length === 12 ? `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}` : '';
}

const normalizeNumber = (n) => String(n || '').trim().toUpperCase().replace(/\s+/g, '');

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

module.exports = { hashPassword, verifyPassword, randomToken, sha256, canonical, signRevision, normalizeCode, normalizeNumber, safeEqual };
