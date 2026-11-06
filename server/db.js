'use strict';
/* Единый интерфейс базы: query(sql, params) и tx(fn).
   В работе используется Postgres (pg), в разработке и тестах — встроенный PGlite,
   поэтому локальный запуск не требует ни аккаунтов, ни установленного Postgres. */
const fs = require('fs');
const path = require('path');

const SCHEMA_SQL = () => fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

function pgDb(connectionString) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX || 3),
    idleTimeoutMillis: 10000,
    ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: true },
  });
  return {
    query: async (sql, params) => (await pool.query(sql, params)).rows,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn({ query: async (sql, params) => (await client.query(sql, params)).rows });
        await client.query('commit');
        return result;
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    migrate: () => pool.query(SCHEMA_SQL()),
    close: () => pool.end(),
  };
}

async function pgliteDb(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite');
  const lite = new PGlite(dataDir);
  await lite.waitReady;
  return {
    query: async (sql, params) => (await lite.query(sql, params)).rows,
    tx: (fn) => lite.transaction((t) => fn({ query: async (sql, params) => (await t.query(sql, params)).rows })),
    migrate: () => lite.exec(SCHEMA_SQL()),
    close: () => lite.close(),
  };
}

module.exports = { pgDb, pgliteDb };
