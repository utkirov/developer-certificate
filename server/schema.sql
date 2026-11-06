-- Схема идемпотентна: npm run db:migrate можно запускать повторно.

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text not null,
  role          text not null check (role in ('analyst', 'manager')),
  password_hash text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists sessions_expires_idx on sessions (expires_at);

-- Сквозная нумерация по годам: номер выдает только сервер и только при выпуске
create table if not exists counters (
  year int primary key,
  n    int not null
);

create table if not exists certificates (
  id              uuid primary key default gen_random_uuid(),
  number          text unique,
  status          text not null default 'draft' check (status in ('draft', 'issued', 'revoked')),
  working         jsonb,            -- рабочая копия: черновик или будущая редакция
  in_review       boolean not null default false,
  review_comment  text,
  lock_version    int not null default 1,
  owner_id        uuid not null references users(id),
  current_version int,
  revoked_reason  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists certificates_updated_idx on certificates (updated_at desc);

-- Выпущенные редакции неизменяемы: см. триггер ниже
create table if not exists revisions (
  id             uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references certificates(id),
  version        int not null,
  number         text not null,
  data           jsonb not null,
  score          numeric not null,
  max_score      numeric not null,
  level          text not null,
  code           text not null unique,
  token          text not null unique,
  attachments    jsonb not null default '[]',
  issued_by      uuid references users(id),
  issued_by_name text not null,
  issued_at      timestamptz not null default now(),
  unique (certificate_id, version)
);
create index if not exists revisions_number_idx on revisions (number);

create table if not exists attachments (
  id             uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references certificates(id) on delete cascade,
  block          int not null,
  filename       text not null,
  mime           text not null,
  size           int not null,
  sha256         text not null,
  content        bytea not null,
  locked         boolean not null default false, -- попал в выпущенную редакцию
  uploaded_by    uuid references users(id),
  created_at     timestamptz not null default now()
);
create index if not exists attachments_cert_idx on attachments (certificate_id);

create table if not exists audit_log (
  id             bigserial primary key,
  at             timestamptz not null default now(),
  actor_id       uuid,
  actor_name     text,
  action         text not null,
  certificate_id uuid,
  details        jsonb not null default '{}'
);
create index if not exists audit_cert_idx on audit_log (certificate_id, id);

-- Счетчики вынесены в базу: у бессерверных функций нет общей памяти
create table if not exists rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  count        int not null
);

create or replace function forbid_change() returns trigger as $$
begin
  raise exception 'Запись неизменяема: %', tg_table_name;
end;
$$ language plpgsql;

drop trigger if exists revisions_immutable on revisions;
create trigger revisions_immutable before update or delete on revisions
  for each row execute function forbid_change();

drop trigger if exists audit_immutable on audit_log;
create trigger audit_immutable before update or delete on audit_log
  for each row execute function forbid_change();
