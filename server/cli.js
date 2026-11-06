'use strict';
/* Обслуживание боевой базы:
     npm run db:migrate
     npm run user:create -- <email> "<Имя>" <analyst|manager>
   Адрес базы берется из DATABASE_URL, пароль — из переменной NEW_USER_PASSWORD,
   чтобы он не попадал в историю команд. */
const { pgDb } = require('./db');
const { hashPassword } = require('./security');

async function main() {
  const [cmd, email, name, role] = process.argv.slice(2);
  if (!process.env.DATABASE_URL) throw new Error('Не задан DATABASE_URL');
  const db = pgDb(process.env.DATABASE_URL);
  try {
    if (cmd === 'migrate') {
      await db.migrate();
      console.log('Схема обновлена');
    } else if (cmd === 'user:create') {
      const password = process.env.NEW_USER_PASSWORD || '';
      if (!email || !name || !['analyst', 'manager'].includes(role)) throw new Error('Формат: user:create <email> "<Имя>" <analyst|manager>');
      if (password.length < 10) throw new Error('Задайте NEW_USER_PASSWORD не короче 10 символов');
      await db.query('insert into users (email, name, role, password_hash) values ($1, $2, $3, $4)', [email.toLowerCase(), name, role, await hashPassword(password)]);
      console.log(`Сотрудник ${email} создан`);
    } else {
      throw new Error('Команды: migrate, user:create');
    }
  } finally {
    await db.close();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
