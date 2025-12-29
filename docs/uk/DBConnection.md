# Памʼятка: змінні оточення для БД та Supabase

Цей сервіс використовує:
- `DATABASE_URL` для підключення до Postgres (`src/db/client.ts`).
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` для admin-скриптів (`scripts/createAdminUser.ts`, `scripts/makeAdminExisting.ts`).
- `SUPABASE_PUBLISHEBLE_KEY` тільки якщо десь потрібен публічний ключ (назва змінної з помилкою в коді).

Примітка: якщо `DATABASE_URL` не заданий і `SUPABASE_URL` локальний (`127.0.0.1`/`localhost`), код підставляє
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Для remote Supabase це не працює, тому там `DATABASE_URL`
має бути заданий явно.

## 1) Production (Supabase remote)

Мінімум:
- `DATABASE_URL=postgresql://...` (строка підключення до БД з Supabase)
- `SUPABASE_URL=https://<project-ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>` (потрібен для admin-скриптів)
- `SUPABASE_PUBLISHEBLE_KEY=<publishable-key>` (опціонально)

## 2) Integration tests (local Postgres, без Supabase)

Мінімум:
- `DATABASE_URL=postgresql://postgres:postgres@db:5432/postgres` (як у `docker-compose.test.yml`)

Опціонально:
- `TEST_USE_COMPOSE=0` якщо хочеш запускати інтеграційні тести без Docker Compose.

## 3) Development with local Supabase

Мінімум:
- `SUPABASE_URL=http://127.0.0.1:54321`
- `SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>`
- `SUPABASE_PUBLISHEBLE_KEY=<local-publishable-key>`
- `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres` (рекомендовано явно)

## 4) Development with remote Supabase

Мінімум:
- `DATABASE_URL=postgresql://...` (remote Postgres)
- `SUPABASE_URL=https://<project-ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>` (потрібен для admin-скриптів)
- `SUPABASE_PUBLISHEBLE_KEY=<publishable-key>` (опціонально)

## 5) Development with local Postgres (без Supabase)

Мінімум:
- `DATABASE_URL=postgresql://<user>:<pass>@127.0.0.1:5432/<db>`

Примітка:
- `SUPABASE_*` не потрібні, але admin-скрипти працювати не будуть без Supabase.

## Перевірка remote Supabase без локального psql

Якщо немає локального `psql`, можна перевірити підключення так:

1) Через Docker (не встановлює нічого локально):
```sh
docker run --rm -it \
  -e PGPASSWORD='<PASSWORD>' \
  postgres:16-alpine \
  psql "postgresql://postgres.<project-ref>@aws-<region>.pooler.supabase.com:5432/postgres?sslmode=require"
```

2) Через Node + `pg` (вже є у проєкті):
```sh
DATABASE_URL="postgresql://postgres.<project-ref>:<PASSWORD>@aws-<region>.pooler.supabase.com:5432/postgres?sslmode=require" \
node -e "const {Client}=require('pg'); const c=new Client({connectionString:process.env.DATABASE_URL}); c.connect().then(()=>{console.log('OK'); return c.end();}).catch(e=>{console.error(e); process.exit(1);})"
```

Примітка:
- Для IPv4 мережі використовуй **Session Pooler** URI з Dashboard (`aws-<region>.pooler.supabase.com:5432`).
