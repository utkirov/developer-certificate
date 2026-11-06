'use strict';
/* Единая точка входа API на Vercel. Настройки — только в переменных окружения. */
const { pgDb } = require('../server/db');
const { createApp } = require('../server/app');

let handler;
function getHandler() {
  if (!handler) {
    handler = createApp({
      db: pgDb(process.env.DATABASE_URL),
      signingSecret: process.env.SIGNING_SECRET,
      publicUrl: process.env.PUBLIC_URL,
    });
  }
  return handler;
}

module.exports = async (req, res) => {
  if (!process.env.DATABASE_URL || !process.env.SIGNING_SECRET) {
    console.error('Не заданы DATABASE_URL или SIGNING_SECRET');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Сервер не настроен' }));
  }
  return getHandler()(req, res);
};
