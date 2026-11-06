'use strict';
/* API приложения. Обычный обработчик (req, res) платформы Node: на Vercel его вызывает
   api/index.js, локально — server/dev.js. */
const QRCode = require('qrcode');
const DC = require('../public/js/core.js');
const sec = require('./security');

const SESSION_COOKIE = 'dc_session';
const SESSION_HOURS = 12;
const JSON_LIMIT = 2 * 1024 * 1024;
/* Ограничение Vercel на тело запроса — 4,5 МБ */
const FILE_LIMIT = 4 * 1024 * 1024;
const IMPORT_LIMIT = 4 * 1024 * 1024;
const FILE_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIN_PASSWORD = 10;

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(buf);
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Слишком большой запрос');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req, limit = JSON_LIMIT) {
  const raw = await readBody(req, limit);
  if (!raw.length) return {};
  try {
    const v = JSON.parse(raw.toString('utf8'));
    if (v && typeof v === 'object') return v;
  } catch (e) { /* ниже общая ошибка */ }
  throw new HttpError(400, 'Некорректный JSON');
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

const clientIp = (req) => String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active });

function summaryOf(row) {
  const data = row.working || row.rev_data || {};
  const ev = DC.evaluate(data);
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    inReview: row.in_review,
    hasWorking: !!row.working,
    reviewComment: row.review_comment,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    version: row.current_version,
    code: row.rev_code || null,
    developer: (row.rev_data || data).b2_legal_name || '',
    project: (row.rev_data || data).b1_name || '',
    inn: (row.rev_data || data).b3_inn || '',
    checkDate: (row.rev_data || data).check_date || '',
    reviewer: (row.rev_data || data).reviewer || '',
    score: row.rev_data ? Number(row.rev_score) : ev.score,
    max: row.rev_data ? Number(row.rev_max) : ev.max,
    level: row.rev_data ? row.rev_level : ev.level,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    issuedAt: row.rev_issued_at || null,
  };
}

const CERT_SELECT = `
  select c.*, u.name as owner_name,
         r.data as rev_data, r.code as rev_code, r.score as rev_score, r.max_score as rev_max,
         r.level as rev_level, r.issued_at as rev_issued_at
    from certificates c
    join users u on u.id = c.owner_id
    left join revisions r on r.certificate_id = c.id and r.version = c.current_version`;

function createApp({ db, signingSecret, publicUrl, secureCookies = true }) {
  if (!signingSecret || signingSecret.length < 32) throw new Error('SIGNING_SECRET должен быть не короче 32 символов');

  const audit = (q, user, action, certificateId, details = {}) => q.query(
    'insert into audit_log (actor_id, actor_name, action, certificate_id, details) values ($1, $2, $3, $4, $5::jsonb)',
    [user ? user.id : null, user ? user.name : null, action, certificateId || null, JSON.stringify(details)],
  );

  async function rateLimit(key, limit, windowSeconds) {
    /* Изредка чистим старые записи: таблица не должна расти бесконечно */
    if (Math.random() < 0.01) await db.query("delete from rate_limits where window_start < now() - interval '1 day'");
    const rows = await db.query(
      `insert into rate_limits (key, window_start, count) values ($1, now(), 1)
       on conflict (key) do update set
         count = case when rate_limits.window_start < now() - ($2::int * interval '1 second') then 1 else rate_limits.count + 1 end,
         window_start = case when rate_limits.window_start < now() - ($2::int * interval '1 second') then now() else rate_limits.window_start end
       returning count`,
      [key, windowSeconds],
    );
    if (rows[0].count > limit) throw new HttpError(429, 'Слишком много попыток. Повторите позже.');
  }

  async function currentUser(req) {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (!token) return null;
    const rows = await db.query(
      `select u.* from sessions s join users u on u.id = s.user_id
        where s.token_hash = $1 and s.expires_at > now() and u.active`,
      [sec.sha256(token)],
    );
    return rows[0] || null;
  }

  const sessionCookie = (value, maxAge) =>
    `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;

  const requireManager = (user) => {
    if (user.role !== 'manager') throw new HttpError(403, 'Действие доступно только руководителю');
  };

  async function loadCert(q, id, lock = false) {
    if (!UUID_RE.test(id)) throw new HttpError(404, 'Заключение не найдено');
    const rows = await q.query(`select * from certificates where id = $1${lock ? ' for update' : ''}`, [id]);
    if (!rows[0]) throw new HttpError(404, 'Заключение не найдено');
    return rows[0];
  }

  const canEditWorking = (user, cert) => user.role === 'manager' || (cert.owner_id === user.id && !cert.in_review);

  const verifyUrl = (req, token) => {
    const base = publicUrl || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
    return `${base.replace(/\/$/, '')}/v/${token}`;
  };

  async function attachmentsOf(q, certId) {
    const rows = await q.query(
      `select id, block, filename, mime, size, sha256, locked, created_at from attachments where certificate_id = $1 order by created_at, id`,
      [certId],
    );
    return rows.map((a) => ({ id: a.id, block: a.block, filename: a.filename, mime: a.mime, size: a.size, sha256: a.sha256, locked: a.locked, createdAt: a.created_at }));
  }

  /* ---------------- заключения ---------------- */

  async function issue(q, user, cert) {
    const data = DC.sanitize(cert.working);
    const errors = DC.validateData(data);
    if (errors.length) throw new HttpError(422, 'Заключение заполнено не полностью', { errors });
    const ev = DC.evaluate(data);

    let number = cert.number;
    if (!number) {
      const year = Number(DC.todayISO().slice(0, 4));
      const [c] = await q.query(
        `insert into counters (year, n) values ($1, 1)
         on conflict (year) do update set n = counters.n + 1 returning n`,
        [year],
      );
      number = `ПЗ-${year}-${String(c.n).padStart(3, '0')}`;
    }
    const version = (cert.current_version || 0) + 1;
    const files = await attachmentsOf(q, cert.id);
    const attachments = files.map(({ id, block, filename, size, sha256 }) => ({ id, block, filename, size, sha256 }));
    const code = sec.signRevision(signingSecret, { number, version, data, attachments });
    const token = sec.randomToken(18);
    await q.query(
      `insert into revisions (certificate_id, version, number, data, score, max_score, level, code, token, attachments, issued_by, issued_by_name)
       values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)`,
      [cert.id, version, number, JSON.stringify(data), ev.score, ev.max, ev.level, code, token, JSON.stringify(attachments), user.id, user.name],
    );
    await q.query('update attachments set locked = true where certificate_id = $1', [cert.id]);
    await q.query(
      `update certificates set number = $2, status = 'issued', working = null, in_review = false, review_comment = null,
              current_version = $3, lock_version = lock_version + 1, updated_at = now() where id = $1`,
      [cert.id, number, version],
    );
    await audit(q, user, 'issue', cert.id, { number, version, code, level: ev.level, score: ev.score });
    return { id: cert.id, number, version, code };
  }

  const handlers = {
    /* ---------- вход ---------- */
    async login(req, res) {
      const body = await readJson(req);
      const email = String(body.email || '').trim().toLowerCase();
      await rateLimit(`login:${sec.sha256(clientIp(req))}`, 20, 900);
      await rateLimit(`login-mail:${sec.sha256(email)}`, 10, 900);
      const [user] = await db.query('select * from users where email = $1', [email]);
      /* Хешируем и при неизвестном адресе: по времени ответа нельзя понять, есть ли сотрудник */
      const ok = user
        ? await sec.verifyPassword(String(body.password || ''), user.password_hash)
        : (await sec.hashPassword(String(body.password || '')), false);
      if (!ok || !user.active) throw new HttpError(401, 'Неверный адрес или пароль');
      const token = sec.randomToken();
      await db.query('delete from sessions where expires_at < now()');
      await db.query(
        `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + ($3::int * interval '1 hour'))`,
        [sec.sha256(token), user.id, SESSION_HOURS],
      );
      await audit(db, user, 'login', null);
      send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(token, SESSION_HOURS * 3600) });
    },

    async logout(req, res) {
      const token = parseCookies(req)[SESSION_COOKIE];
      if (token) await db.query('delete from sessions where token_hash = $1', [sec.sha256(token)]);
      send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
    },

    async me(req, res, { user }) {
      send(res, 200, { user: publicUser(user) });
    },

    async changePassword(req, res, { user }) {
      const body = await readJson(req);
      if (!(await sec.verifyPassword(String(body.current || ''), user.password_hash))) throw new HttpError(400, 'Текущий пароль указан неверно');
      if (String(body.next || '').length < MIN_PASSWORD) throw new HttpError(400, `Новый пароль должен быть не короче ${MIN_PASSWORD} символов`);
      await db.query('update users set password_hash = $2 where id = $1', [user.id, await sec.hashPassword(body.next)]);
      await db.query('delete from sessions where user_id = $1', [user.id]);
      await audit(db, user, 'password_change', null);
      send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
    },

    /* ---------- сотрудники ---------- */
    async listUsers(req, res, { user }) {
      requireManager(user);
      const rows = await db.query('select * from users order by created_at');
      send(res, 200, { users: rows.map(publicUser) });
    },

    async createUser(req, res, { user }) {
      requireManager(user);
      const body = await readJson(req);
      const email = String(body.email || '').trim().toLowerCase();
      const name = String(body.name || '').trim().slice(0, 160);
      if (!/^[^@\s]+@[^@\s]+$/.test(email) || !name) throw new HttpError(400, 'Укажите имя и корректный адрес');
      if (!['analyst', 'manager'].includes(body.role)) throw new HttpError(400, 'Неизвестная роль');
      if (String(body.password || '').length < MIN_PASSWORD) throw new HttpError(400, `Пароль должен быть не короче ${MIN_PASSWORD} символов`);
      const exists = await db.query('select 1 from users where email = $1', [email]);
      if (exists.length) throw new HttpError(409, 'Сотрудник с таким адресом уже есть');
      const [row] = await db.query(
        'insert into users (email, name, role, password_hash) values ($1, $2, $3, $4) returning *',
        [email, name, body.role, await sec.hashPassword(body.password)],
      );
      await audit(db, user, 'user_create', null, { email, role: body.role });
      send(res, 201, { user: publicUser(row) });
    },

    async updateUser(req, res, { user, params }) {
      requireManager(user);
      if (!UUID_RE.test(params.id)) throw new HttpError(404, 'Сотрудник не найден');
      const body = await readJson(req);
      const [target] = await db.query('select * from users where id = $1', [params.id]);
      if (!target) throw new HttpError(404, 'Сотрудник не найден');
      const role = body.role === undefined ? target.role : body.role;
      const active = body.active === undefined ? target.active : !!body.active;
      if (!['analyst', 'manager'].includes(role)) throw new HttpError(400, 'Неизвестная роль');
      /* Иначе можно остаться вообще без руководителя */
      if (target.id === user.id && (role !== 'manager' || !active)) throw new HttpError(400, 'Нельзя снять права или отключить самого себя');
      let hash = target.password_hash;
      if (body.password !== undefined) {
        if (String(body.password).length < MIN_PASSWORD) throw new HttpError(400, `Пароль должен быть не короче ${MIN_PASSWORD} символов`);
        hash = await sec.hashPassword(body.password);
      }
      const [row] = await db.query(
        'update users set role = $2, active = $3, password_hash = $4 where id = $1 returning *',
        [target.id, role, active, hash],
      );
      if (!active || body.password !== undefined) await db.query('delete from sessions where user_id = $1', [target.id]);
      await audit(db, user, 'user_update', null, { email: target.email, role, active, passwordReset: body.password !== undefined });
      send(res, 200, { user: publicUser(row) });
    },

    /* ---------- заключения ---------- */
    async listCerts(req, res) {
      const rows = await db.query(`${CERT_SELECT} order by c.updated_at desc limit 2000`);
      send(res, 200, { items: rows.map(summaryOf) });
    },

    async createCert(req, res, { user }) {
      const body = await readJson(req);
      const data = DC.sanitize(body.data);
      const [row] = await db.query(
        'insert into certificates (working, owner_id) values ($1::jsonb, $2) returning id, lock_version',
        [JSON.stringify(data), user.id],
      );
      await audit(db, user, 'create', row.id);
      send(res, 201, { id: row.id, lockVersion: row.lock_version });
    },

    async getCert(req, res, { params }) {
      if (!UUID_RE.test(params.id)) throw new HttpError(404, 'Заключение не найдено');
      const [row] = await db.query(`${CERT_SELECT} where c.id = $1`, [params.id]);
      if (!row) throw new HttpError(404, 'Заключение не найдено');
      const revisions = await db.query(
        `select version, code, score, max_score, level, issued_by_name, issued_at from revisions where certificate_id = $1 order by version desc`,
        [params.id],
      );
      const log = await db.query('select at, actor_name, action, details from audit_log where certificate_id = $1 order by id desc limit 200', [params.id]);
      send(res, 200, {
        ...summaryOf(row),
        lockVersion: row.lock_version,
        revokedReason: row.revoked_reason,
        data: row.working || row.rev_data,
        attachments: await attachmentsOf(db, row.id),
        revisions: revisions.map((r) => ({ version: r.version, code: r.code, score: Number(r.score), max: Number(r.max_score), level: r.level, issuedBy: r.issued_by_name, issuedAt: r.issued_at })),
        log: log.map((l) => ({ at: l.at, actor: l.actor_name, action: l.action, details: l.details })),
      });
    },

    async saveWorking(req, res, { user, params }) {
      const body = await readJson(req);
      const data = DC.sanitize(body.data);
      const result = await db.tx(async (q) => {
        const cert = await loadCert(q, params.id, true);
        if (cert.status === 'revoked') throw new HttpError(409, 'Аннулированное заключение нельзя менять. Сначала восстановите его.');
        if (!canEditWorking(user, cert)) {
          throw new HttpError(403, cert.in_review ? 'Заключение на проверке у руководителя' : 'Заключение ведет другой сотрудник');
        }
        if (cert.status === 'issued' && user.role !== 'manager') throw new HttpError(403, 'Новую редакцию выпущенного заключения готовит руководитель');
        if (Number(body.lockVersion) !== cert.lock_version) {
          throw new HttpError(409, 'Заключение уже изменил другой сотрудник. Обновите страницу.');
        }
        const [row] = await q.query(
          `update certificates set working = $2::jsonb, lock_version = lock_version + 1, updated_at = now() where id = $1 returning lock_version`,
          [cert.id, JSON.stringify(data)],
        );
        return row;
      });
      send(res, 200, { lockVersion: result.lock_version });
    },

    async discard(req, res, { user, params }) {
      await db.tx(async (q) => {
        const cert = await loadCert(q, params.id, true);
        if (cert.status === 'draft') {
          if (user.role !== 'manager' && cert.owner_id !== user.id) throw new HttpError(403, 'Черновик ведет другой сотрудник');
          await q.query('delete from certificates where id = $1', [cert.id]);
          await audit(q, user, 'draft_delete', cert.id);
          return;
        }
        requireManager(user);
        if (!cert.working) throw new HttpError(409, 'Нет несохраненной редакции');
        await q.query(
          'update certificates set working = null, in_review = false, lock_version = lock_version + 1, updated_at = now() where id = $1',
          [cert.id],
        );
        await audit(q, user, 'working_discard', cert.id);
      });
      send(res, 200, { ok: true });
    },

    async submit(req, res, { user, params }) {
      await db.tx(async (q) => {
        const cert = await loadCert(q, params.id, true);
        if (!cert.working) throw new HttpError(409, 'Нечего отправлять');
        if (!canEditWorking(user, cert)) throw new HttpError(403, 'Заключение ведет другой сотрудник');
        const errors = DC.validateData(DC.sanitize(cert.working));
        if (errors.length) throw new HttpError(422, 'Заключение заполнено не полностью', { errors });
        await q.query('update certificates set in_review = true, review_comment = null, lock_version = lock_version + 1, updated_at = now() where id = $1', [cert.id]);
        await audit(q, user, 'submit', cert.id);
      });
      send(res, 200, { ok: true });
    },

    async sendBack(req, res, { user, params }) {
      requireManager(user);
      const body = await readJson(req);
      const comment = String(body.comment || '').trim().slice(0, 1000);
      if (!comment) throw new HttpError(400, 'Укажите, что нужно исправить');
      await db.tx(async (q) => {
        const cert = await loadCert(q, params.id, true);
        await q.query('update certificates set in_review = false, review_comment = $2, lock_version = lock_version + 1, updated_at = now() where id = $1', [cert.id, comment]);
        await audit(q, user, 'send_back', cert.id, { comment });
      });
      send(res, 200, { ok: true });
    },

    async issueCert(req, res, { user, params }) {
      requireManager(user);
      const result = await db.tx(async (q) => {
        const cert = await loadCert(q, params.id, true);
        if (cert.status === 'revoked') throw new HttpError(409, 'Аннулированное заключение нельзя перевыпустить. Сначала восстановите его.');
        if (!cert.working) throw new HttpError(409, 'Нет изменений для выпуска');
        return issue(q, user, cert);
      });
      send(res, 200, result);
    },

    async revoke(req, res, { user, params }) {
      requireManager(user);
      const body = await readJson(req);
      const reason = String(body.reason || '').trim().slice(0, 1000);
      if (!reason) throw new HttpError(400, 'Укажите причину аннулирования');
      await db.tx(async (q) => {
        const cert = await loadCert(q, params.id, true);
        if (cert.status !== 'issued') throw new HttpError(409, 'Аннулировать можно только выпущенное заключение');
        await q.query(`update certificates set status = 'revoked', revoked_reason = $2, lock_version = lock_version + 1, updated_at = now() where id = $1`, [cert.id, reason]);
        await audit(q, user, 'revoke', cert.id, { reason });
      });
      send(res, 200, { ok: true });
    },

    async restore(req, res, { user, params }) {
      requireManager(user);
      await db.tx(async (q) => {
        const cert = await loadCert(q, params.id, true);
        if (cert.status !== 'revoked') throw new HttpError(409, 'Заключение не аннулировано');
        await q.query(`update certificates set status = 'issued', revoked_reason = null, lock_version = lock_version + 1, updated_at = now() where id = $1`, [cert.id]);
        await audit(q, user, 'restore', cert.id);
      });
      send(res, 200, { ok: true });
    },

    /* Данные для листов A4: выпущенная редакция или предпросмотр рабочей копии */
    async document(req, res, { params, url }) {
      const cert = await loadCert(db, params.id);
      const wanted = url.searchParams.get('version');
      if (wanted === 'working' || (!wanted && !cert.current_version)) {
        if (!cert.working) throw new HttpError(404, 'Нет рабочей копии');
        const data = DC.sanitize(cert.working);
        return send(res, 200, {
          id: cert.id, preview: true, number: cert.number, version: (cert.current_version || 0) + 1, status: cert.status,
          data, code: null, qrSvg: null, verifyUrl: null, createdAt: cert.created_at, issuedAt: null,
          attachments: await attachmentsOf(db, cert.id),
        });
      }
      const version = wanted ? Number(wanted) : cert.current_version;
      const [rev] = await db.query('select * from revisions where certificate_id = $1 and version = $2', [cert.id, version]);
      if (!rev) throw new HttpError(404, 'Редакция не найдена');
      const link = verifyUrl(req, rev.token);
      send(res, 200, {
        id: cert.id, preview: false, number: rev.number, version: rev.version, latestVersion: cert.current_version,
        status: cert.status, revokedReason: cert.revoked_reason, data: rev.data, code: rev.code,
        verifyUrl: link, qrSvg: await QRCode.toString(link, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }),
        createdAt: cert.created_at, issuedAt: rev.issued_at, issuedBy: rev.issued_by_name, attachments: rev.attachments,
      });
    },

    /* ---------- файлы ---------- */
    async uploadFile(req, res, { user, params, url }) {
      const mime = String(req.headers['content-type'] || '').split(';')[0].trim();
      if (!FILE_TYPES[mime]) throw new HttpError(415, 'Разрешены только PDF, JPG, PNG и WEBP');
      const block = Number(url.searchParams.get('block'));
      if (!DC.BLOCKS.some((b) => b.n === block)) throw new HttpError(400, 'Неизвестный блок');
      const filename = String(url.searchParams.get('name') || 'file').replace(/[\\/\0-\x1f"]/g, '_').slice(0, 200);
      const content = await readBody(req, FILE_LIMIT);
      if (!content.length) throw new HttpError(400, 'Пустой файл');
      const file = await db.tx(async (q) => {
        const cert = await loadCert(q, params.id, true);
        if (cert.status === 'revoked' || !canEditWorking(user, cert)) throw new HttpError(403, 'Нет прав менять это заключение');
        const [row] = await q.query(
          `insert into attachments (certificate_id, block, filename, mime, size, sha256, content, uploaded_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, created_at`,
          [cert.id, block, filename, mime, content.length, sec.sha256(content), content, user.id],
        );
        await audit(q, user, 'file_add', cert.id, { block, filename });
        return { id: row.id, block, filename, mime, size: content.length, sha256: sec.sha256(content), locked: false, createdAt: row.created_at };
      });
      send(res, 201, { file });
    },

    async downloadFile(req, res, { params }) {
      if (!UUID_RE.test(params.id)) throw new HttpError(404, 'Файл не найден');
      const [f] = await db.query('select filename, mime, content from attachments where id = $1', [params.id]);
      if (!f) throw new HttpError(404, 'Файл не найден');
      /* Всегда как вложение, с типом из белого списка: файл не исполнится на нашем домене */
      const ascii = f.filename.replace(/[^\x20-\x7e]/g, '_');
      send(res, 200, Buffer.from(f.content), {
        'Content-Type': f.mime,
        'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      });
    },

    async deleteFile(req, res, { user, params }) {
      if (!UUID_RE.test(params.id)) throw new HttpError(404, 'Файл не найден');
      await db.tx(async (q) => {
        const [f] = await q.query('select id, certificate_id, filename, locked from attachments where id = $1', [params.id]);
        if (!f) throw new HttpError(404, 'Файл не найден');
        if (f.locked) throw new HttpError(409, 'Файл входит в выпущенную редакцию, удалить его нельзя');
        const cert = await loadCert(q, f.certificate_id, true);
        if (!canEditWorking(user, cert)) throw new HttpError(403, 'Нет прав менять это заключение');
        await q.query('delete from attachments where id = $1', [f.id]);
        await audit(q, user, 'file_delete', cert.id, { filename: f.filename });
      });
      send(res, 200, { ok: true });
    },

    /* ---------- резервная копия и перенос ---------- */
    async exportAll(req, res, { user }) {
      requireManager(user);
      const certs = await db.query('select * from certificates order by created_at');
      const revs = await db.query('select * from revisions order by certificate_id, version');
      await audit(db, user, 'export', null, { certificates: certs.length });
      send(res, 200, { format: 'developer-certificate-backup', version: 2, exportedAt: new Date().toISOString(), certificates: certs, revisions: revs });
    },

    /* Импорт реестра старой версии (localStorage). Запись без полной оценки или с занятым
       номером отклоняется: молча принять ее значит сломать показ или проверку документа. */
    async importLegacy(req, res, { user }) {
      requireManager(user);
      const body = await readJson(req, IMPORT_LIMIT);
      const items = Array.isArray(body) ? body : body.items;
      if (!Array.isArray(items)) throw new HttpError(400, 'Неверный формат файла');
      const report = { added: 0, rejected: [] };
      for (const r of items) {
        const label = String((r && r.number) || '—').slice(0, 40);
        try {
          await db.tx(async (q) => {
            if (!r || typeof r !== 'object' || !r.data || typeof r.data !== 'object') throw new HttpError(400, 'нет данных проверки');
            const number = sec.normalizeNumber(r.number || r.data.cert_number);
            if (!/^ПЗ-\d{4}-\d{3,}$/.test(number)) throw new HttpError(400, 'номер не в формате ПЗ-ГГГГ-NNN');
            if ((await q.query('select 1 from certificates where number = $1', [number])).length) throw new HttpError(409, 'номер уже занят');
            const data = DC.sanitize({ ...r.data, schema: 1 });
            const ev = DC.evaluate(data);
            if (!ev.complete) throw new HttpError(400, 'оценены не все блоки');
            if (!data.b2_legal_name || !data.b3_inn) throw new HttpError(400, 'нет застройщика или ИНН');
            const createdAt = new Date(r.createdAt);
            const issuedAt = isNaN(createdAt) ? new Date() : createdAt;
            const revoked = r.status === 'revoked';
            const [c] = await q.query(
              `insert into certificates (number, status, owner_id, current_version, revoked_reason, created_at)
               values ($1, $2, $3, 1, $4, $5) returning id`,
              [number, revoked ? 'revoked' : 'issued', user.id, revoked ? 'Аннулирован в реестре прежней версии' : null, issuedAt],
            );
            const code = sec.signRevision(signingSecret, { number, version: 1, data, attachments: [] });
            await q.query(
              `insert into revisions (certificate_id, version, number, data, score, max_score, level, code, token, issued_by, issued_by_name, issued_at)
               values ($1, 1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11)`,
              [c.id, number, JSON.stringify(data), ev.score, ev.max, ev.level, code, sec.randomToken(18), user.id, user.name, issuedAt],
            );
            const m = /^ПЗ-(\d{4})-(\d+)$/.exec(number);
            await q.query(
              `insert into counters (year, n) values ($1, $2)
               on conflict (year) do update set n = greatest(counters.n, excluded.n)`,
              [Number(m[1]), Number(m[2])],
            );
            await audit(q, user, 'import', c.id, { number });
          });
          report.added += 1;
        } catch (e) {
          if (!(e instanceof HttpError)) throw e;
          report.rejected.push({ number: label, reason: e.message });
        }
      }
      send(res, 200, report);
    },

    /* ---------- публичная проверка ---------- */
    /* Без секрета (токена или кода) ничего не отвечаем: номера идут подряд, и иначе
       реестр можно было бы выкачать перебором. Отдаем минимум и никаких ФИО. */
    async verify(req, res, { url }) {
      await rateLimit(`verify:${sec.sha256(clientIp(req))}`, 30, 60);
      const token = url.searchParams.get('token');
      const number = sec.normalizeNumber(url.searchParams.get('number'));
      const code = sec.normalizeCode(url.searchParams.get('code'));
      let rev = null;
      if (token) {
        [rev] = await db.query('select * from revisions where token = $1', [String(token).slice(0, 64)]);
      } else if (number && code) {
        [rev] = await db.query('select * from revisions where number = $1 and code = $2', [number, code]);
      } else {
        throw new HttpError(400, 'Укажите номер и контрольный код');
      }
      if (!rev) return send(res, 200, { found: false });
      const [cert] = await db.query('select status, current_version from certificates where id = $1', [rev.certificate_id]);
      const expected = sec.signRevision(signingSecret, { number: rev.number, version: rev.version, data: rev.data, attachments: rev.attachments });
      if (!sec.safeEqual(expected, rev.code)) {
        console.error('Подпись редакции не сходится', rev.number, rev.version);
        return send(res, 200, { found: true, state: 'tampered', number: rev.number });
      }
      const until = DC.validUntil(rev.data.check_date);
      let state = 'valid';
      if (cert.status === 'revoked') state = 'revoked';
      else if (rev.version !== cert.current_version) state = 'superseded';
      send(res, 200, {
        found: true,
        state,
        number: rev.number,
        version: rev.version,
        latestVersion: cert.current_version,
        developer: rev.data.b2_legal_name,
        inn: rev.data.b3_inn,
        project: rev.data.b1_name,
        checkDate: rev.data.check_date,
        validUntil: until,
        outdated: until < DC.todayISO(),
        score: Number(rev.score),
        max: Number(rev.max_score),
        level: rev.level,
        issuedAt: rev.issued_at,
        issuer: `${DC.ISSUER.name}, ИНН ${DC.ISSUER.inn}`,
      });
    },

    async health(req, res) {
      await db.query('select 1');
      send(res, 200, { ok: true });
    },
  };

  const routes = [
    ['POST', '/auth/login', 'login', { public: true }],
    ['POST', '/auth/logout', 'logout', { public: true }],
    ['GET', '/auth/me', 'me'],
    ['POST', '/auth/password', 'changePassword'],
    ['GET', '/users', 'listUsers'],
    ['POST', '/users', 'createUser'],
    ['PATCH', '/users/:id', 'updateUser'],
    ['GET', '/certificates', 'listCerts'],
    ['POST', '/certificates', 'createCert'],
    ['GET', '/certificates/:id', 'getCert'],
    ['PUT', '/certificates/:id/working', 'saveWorking'],
    ['DELETE', '/certificates/:id/working', 'discard'],
    ['POST', '/certificates/:id/submit', 'submit'],
    ['POST', '/certificates/:id/return', 'sendBack'],
    ['POST', '/certificates/:id/issue', 'issueCert'],
    ['POST', '/certificates/:id/revoke', 'revoke'],
    ['POST', '/certificates/:id/restore', 'restore'],
    ['GET', '/certificates/:id/document', 'document'],
    ['POST', '/certificates/:id/files', 'uploadFile'],
    ['GET', '/files/:id', 'downloadFile'],
    ['DELETE', '/files/:id', 'deleteFile'],
    ['GET', '/export', 'exportAll'],
    ['POST', '/import', 'importLegacy'],
    ['GET', '/public/verify', 'verify', { public: true }],
    ['GET', '/health', 'health', { public: true }],
  ].map(([method, pattern, name, opts]) => ({
    method,
    name,
    public: !!(opts && opts.public),
    keys: (pattern.match(/:\w+/g) || []).map((k) => k.slice(1)),
    re: new RegExp(`^${pattern.replace(/:\w+/g, '([^/]+)')}$`),
  }));

  return async function handle(req, res) {
    try {
      const url = new URL(req.url, 'http://local');
      /* На Vercel путь приходит параметром __route (см. rewrites в vercel.json) */
      const routed = url.searchParams.get('__route');
      const path = routed !== null ? `/${routed}` : url.pathname.replace(/^\/api/, '');

      /* Браузер присылает Origin при запросах, меняющих данные. Чужой сайт отсекаем
         здесь; дополнительно cookie помечена SameSite=Lax. */
      if (req.method !== 'GET' && req.headers.origin) {
        const originHost = new URL(req.headers.origin).host;
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        if (originHost !== host) throw new HttpError(403, 'Запрос с чужого сайта отклонен');
      }

      for (const route of routes) {
        if (route.method !== req.method) continue;
        const m = route.re.exec(path);
        if (!m) continue;
        const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        let user = null;
        if (!route.public) {
          user = await currentUser(req);
          if (!user) throw new HttpError(401, 'Требуется вход');
        }
        return await handlers[route.name](req, res, { user, params, url });
      }
      throw new HttpError(404, 'Не найдено');
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...e.extra });
      console.error(e);
      return send(res, 500, { error: 'Внутренняя ошибка сервера' });
    }
  };
}

module.exports = { createApp };
