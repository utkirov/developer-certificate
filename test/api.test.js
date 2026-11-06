'use strict';
/* Проверка API на настоящем SQL: встроенный Postgres (PGlite) в памяти и живой HTTP-сервер */
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { pgliteDb } = require('../server/db');
const { createApp } = require('../server/app');
const { hashPassword } = require('../server/security');
const DC = require('../public/js/core.js');
const { completeData } = require('./fixtures');

const PASS = 'test-password-123';
let db, server, base;

function client() {
  let cookie = '';
  return async function call(method, path, body, headers = {}) {
    const isBinary = Buffer.isBuffer(body);
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined && !isBinary ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : isBinary ? body : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, json: type.includes('json') ? await res.json() : null, raw: type.includes('json') ? null : Buffer.from(await res.arrayBuffer()) };
  };
}

let manager, analyst, anon;

test.before(async () => {
  db = await pgliteDb();
  await db.migrate();
  const hash = await hashPassword(PASS);
  await db.query(`insert into users (email, name, role, password_hash) values ('m@t.test', 'Руководитель', 'manager', $1), ('a@t.test', 'Аналитик', 'analyst', $1), ('b@t.test', 'Другой аналитик', 'analyst', $1)`, [hash]);
  const app = createApp({ db, signingSecret: 'x'.repeat(40), publicUrl: 'https://check.test', secureCookies: false });
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  manager = client(); analyst = client(); anon = client();
  assert.equal((await manager('POST', '/auth/login', { email: 'm@t.test', password: PASS })).status, 200);
  assert.equal((await analyst('POST', '/auth/login', { email: 'a@t.test', password: PASS })).status, 200);
});

test.after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});

const newCert = async (over) => (await analyst('POST', '/certificates', { data: completeData(over) })).json;
const issued = async (over) => {
  const c = await newCert(over);
  const r = await manager('POST', `/certificates/${c.id}/issue`);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return { id: c.id, ...r.json };
};

test('без входа данные недоступны', async () => {
  assert.equal((await anon('GET', '/certificates')).status, 401);
  assert.equal((await anon('GET', '/users')).status, 401);
});

test('неверный пароль и cookie с защитными флагами', async () => {
  const c = client();
  assert.equal((await c('POST', '/auth/login', { email: 'm@t.test', password: 'wrong-password' })).status, 401);
  const r = await c('POST', '/auth/login', { email: 'm@t.test', password: PASS });
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(r.json.user.password_hash, undefined);
});

test('запрос с чужого сайта отклоняется', async () => {
  const r = await analyst('POST', '/certificates', { data: {} }, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('аналитик не может выпускать и аннулировать', async () => {
  const c = await newCert();
  assert.equal((await analyst('POST', `/certificates/${c.id}/issue`)).status, 403);
  const done = await issued();
  assert.equal((await analyst('POST', `/certificates/${done.id}/revoke`, { reason: 'x' })).status, 403);
  assert.equal((await analyst('GET', '/users')).status, 403);
  assert.equal((await analyst('GET', '/export')).status, 403);
});

test('неполное заключение не выпускается', async () => {
  const c = (await analyst('POST', '/certificates', { data: { b1_name: 'ЖК' } })).json;
  const r = await manager('POST', `/certificates/${c.id}/issue`);
  assert.equal(r.status, 422);
  assert.ok(r.json.errors.length > 10);
});

test('сервер сам считает оценку и выдает номера по порядку', async () => {
  const a = await issued();
  const b = await issued({ b12_status: 'warn', b12_missing: 'Договор надзора', recommendation: DC.RECOMMENDATIONS[1] });
  const year = DC.todayISO().slice(0, 4);
  assert.match(a.number, new RegExp(`^ПЗ-${year}-\\d{3}$`));
  assert.equal(Number(b.number.slice(-3)), Number(a.number.slice(-3)) + 1);
  assert.match(b.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  const doc = (await manager('GET', `/certificates/${b.id}/document`)).json;
  assert.ok(doc.qrSvg.startsWith('<svg'));
  assert.match(doc.verifyUrl, /^https:\/\/check\.test\/v\//);
  const list = (await manager('GET', '/certificates')).json.items;
  const row = list.find((x) => x.id === b.id);
  assert.equal(row.score, 55);
  assert.equal(row.level, 'mid');
});

test('чужой черновик аналитику менять нельзя, конфликт версий ловится', async () => {
  const c = await newCert();
  const other = client();
  await other('POST', '/auth/login', { email: 'b@t.test', password: PASS });
  assert.equal((await other('PUT', `/certificates/${c.id}/working`, { data: completeData(), lockVersion: c.lockVersion })).status, 403);
  const ok = await analyst('PUT', `/certificates/${c.id}/working`, { data: completeData(), lockVersion: c.lockVersion });
  assert.equal(ok.status, 200);
  assert.equal((await analyst('PUT', `/certificates/${c.id}/working`, { data: completeData(), lockVersion: c.lockVersion })).status, 409);
});

test('на проверке аналитик не правит, руководитель возвращает с комментарием', async () => {
  const c = await newCert();
  assert.equal((await analyst('POST', `/certificates/${c.id}/submit`)).status, 200);
  const cur = (await analyst('GET', `/certificates/${c.id}`)).json;
  assert.equal(cur.inReview, true);
  assert.equal((await analyst('PUT', `/certificates/${c.id}/working`, { data: completeData(), lockVersion: cur.lockVersion })).status, 403);
  assert.equal((await manager('POST', `/certificates/${c.id}/return`, {})).status, 400);
  assert.equal((await manager('POST', `/certificates/${c.id}/return`, { comment: 'Уточнить ИНН' })).status, 200);
  const back = (await analyst('GET', `/certificates/${c.id}`)).json;
  assert.equal(back.inReview, false);
  assert.equal(back.reviewComment, 'Уточнить ИНН');
});

test('новая редакция не затирает старую, старый QR показывает устаревшую', async () => {
  const a = await issued();
  const before = (await manager('GET', `/certificates/${a.id}/document`)).json;
  const token1 = before.verifyUrl.split('/').pop();
  const cur = (await manager('GET', `/certificates/${a.id}`)).json;
  const data = { ...cur.data, b1_name: 'ЖК Новое имя' };
  assert.equal((await manager('PUT', `/certificates/${a.id}/working`, { data, lockVersion: cur.lockVersion })).status, 200);
  const r2 = await manager('POST', `/certificates/${a.id}/issue`);
  assert.equal(r2.json.version, 2);
  assert.equal(r2.json.number, a.number);
  assert.notEqual(r2.json.code, a.code);
  const v1 = (await anon('GET', `/public/verify?token=${token1}`)).json;
  assert.equal(v1.state, 'superseded');
  assert.equal(v1.project, 'ЖК Тестовый');
  const old = (await manager('GET', `/certificates/${a.id}/document?version=1`)).json;
  assert.equal(old.data.b1_name, 'ЖК Тестовый');
});

test('выпущенную редакцию и журнал нельзя изменить даже напрямую в базе', async () => {
  await issued();
  await assert.rejects(db.query(`update revisions set score = 60`));
  await assert.rejects(db.query(`delete from revisions`));
  await assert.rejects(db.query(`update audit_log set action = 'x'`));
  await assert.rejects(db.query(`delete from audit_log`));
});

test('удалить можно только невыпущенный черновик', async () => {
  const c = await newCert();
  assert.equal((await analyst('DELETE', `/certificates/${c.id}/working`)).status, 200);
  assert.equal((await analyst('GET', `/certificates/${c.id}`)).status, 404);
  const a = await issued();
  assert.equal((await manager('DELETE', `/certificates/${a.id}/working`)).status, 409);
  assert.equal((await manager('GET', `/certificates/${a.id}`)).status, 200);
});

test('публичная проверка: минимум данных и нужные секреты', async () => {
  const a = await issued();
  assert.equal((await anon('GET', `/public/verify?number=${encodeURIComponent(a.number)}`)).status, 400);
  assert.equal((await anon('GET', `/public/verify?number=${encodeURIComponent(a.number)}&code=0000-0000-0000`)).json.found, false);
  const r = (await anon('GET', `/public/verify?number=${encodeURIComponent(a.number)}&code=${a.code.toLowerCase()}`)).json;
  assert.equal(r.state, 'valid');
  assert.equal(r.developer, 'ООО «Тест Строй»');
  const text = JSON.stringify(r);
  assert.ok(!text.includes('Тестовый проверяющий'), 'ФИО проверяющего не публикуется');
  assert.ok(!text.includes('b6_fio'));
  assert.ok(!text.includes('Значение b5_founders'));
});

test('аннулирование и восстановление видны в проверке', async () => {
  const a = await issued();
  const q = `/public/verify?number=${encodeURIComponent(a.number)}&code=${a.code}`;
  assert.equal((await manager('POST', `/certificates/${a.id}/revoke`, {})).status, 400);
  assert.equal((await manager('POST', `/certificates/${a.id}/revoke`, { reason: 'Ошибка в данных' })).status, 200);
  assert.equal((await anon('GET', q)).json.state, 'revoked');
  assert.equal((await manager('POST', `/certificates/${a.id}/restore`)).status, 200);
  assert.equal((await anon('GET', q)).json.state, 'valid');
});

test('файлы: белый список, доступ по входу, блокировка после выпуска', async () => {
  const c = await newCert();
  const pdf = Buffer.from('%PDF-1.4 test');
  const bad = await analyst('POST', `/certificates/${c.id}/files?block=12&name=x.html`, Buffer.from('<script>'), { 'Content-Type': 'text/html' });
  assert.equal(bad.status, 415);
  const up = await analyst('POST', `/certificates/${c.id}/files?block=12&name=${encodeURIComponent('Разрешение.pdf')}`, pdf, { 'Content-Type': 'application/pdf' });
  assert.equal(up.status, 201);
  const id = up.json.file.id;
  assert.equal((await anon('GET', `/files/${id}`)).status, 401);
  const dl = await analyst('GET', `/files/${id}`);
  assert.deepEqual(dl.raw, pdf);
  assert.match(dl.headers.get('content-disposition'), /^attachment/);
  await manager('POST', `/certificates/${c.id}/issue`);
  assert.equal((await manager('DELETE', `/files/${id}`)).status, 409);
});

test('импорт старого реестра: плохие записи отклоняются с причиной', async () => {
  const good = { number: 'ПЗ-2025-007', status: 'issued', createdAt: '2025-03-01T10:00:00Z', data: completeData({ schema: undefined }) };
  const revoked = { number: 'ПЗ-2025-008', status: 'revoked', data: completeData() };
  const incomplete = { number: 'ПЗ-2025-009', data: { b1_name: 'x' } };
  const r = await manager('POST', '/import', { items: [good, revoked, incomplete, good, { number: 'bad', data: completeData() }, null] });
  assert.equal(r.status, 200);
  assert.equal(r.json.added, 2);
  assert.equal(r.json.rejected.length, 4);
  const list = (await manager('GET', '/certificates')).json.items;
  const imp = list.find((x) => x.number === 'ПЗ-2025-007');
  assert.equal(imp.max, 50);
  const doc = (await manager('GET', `/certificates/${imp.id}/document`)).json;
  assert.equal(doc.data.schema, 1);
  assert.equal(list.find((x) => x.number === 'ПЗ-2025-008').status, 'revoked');
  /* Номера нового года после импорта не пересекаются */
  const counter = await db.query('select n from counters where year = 2025');
  assert.equal(counter[0].n, 8);
});

test('сотрудники: руководитель создает, себя отключить нельзя', async () => {
  const short = await manager('POST', '/users', { email: 'n@t.test', name: 'Новый', role: 'analyst', password: '123' });
  assert.equal(short.status, 400);
  const r = await manager('POST', '/users', { email: 'n@t.test', name: 'Новый', role: 'analyst', password: 'new-password-1' });
  assert.equal(r.status, 201);
  assert.equal(r.json.user.password_hash, undefined);
  const me = (await manager('GET', '/auth/me')).json.user;
  assert.equal((await manager('PATCH', `/users/${me.id}`, { active: false })).status, 400);
  const nw = client();
  await nw('POST', '/auth/login', { email: 'n@t.test', password: 'new-password-1' });
  assert.equal((await manager('PATCH', `/users/${r.json.user.id}`, { active: false })).status, 200);
  assert.equal((await nw('GET', '/auth/me')).status, 401);
});

test('подбор пароля упирается в лимит', async () => {
  const c = client();
  let last;
  for (let i = 0; i < 11; i++) last = await c('POST', '/auth/login', { email: 'limit@t.test', password: 'wrong-password' });
  assert.equal(last.status, 429);
});

test('подмена данных в базе обнаруживается при проверке', async () => {
  const a = await issued();
  await db.query('alter table revisions disable trigger revisions_immutable');
  await db.query(`update revisions set data = jsonb_set(data, '{b1_name}', '"Подмена"') where certificate_id = $1`, [a.id]);
  await db.query('alter table revisions enable trigger revisions_immutable');
  const r = (await anon('GET', `/public/verify?number=${encodeURIComponent(a.number)}&code=${a.code}`)).json;
  assert.equal(r.state, 'tampered');
  assert.equal(r.project, undefined);
});
