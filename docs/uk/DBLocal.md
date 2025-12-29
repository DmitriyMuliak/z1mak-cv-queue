// Aply SQL in the current Volume
cat 001_create_ai_models.sql | docker compose -f docker-compose.develop.yml exec -T db psql -U postgres -d postgres

// Запуск psql за допомогою docker
Подивитись які запущені (за compose-файлом): docker compose -f docker-compose.develop.yml ps
Усі контейнери Docker: docker ps (активні) або docker ps -a (усі).
Зайти в psql саме в цьому контейнері: docker compose -f docker-compose.develop.yml exec -it db psql -U postgres -d postgres
Якщо треба спершу зайти в шелл контейнера: docker compose -f docker-compose.develop.yml exec -it db sh і там виконати psql -U postgres -d postgres.

// Підключення на пряму -
Підключення з хоста напряму: PGPASSWORD=postgres psql -h 127.0.0.1 -p 5432 -U postgres -d postgres (пароль із compose: postgres).
Альтернатива одним рядком: psql "postgresql://postgres:postgres@127.0.0.1:5432/postgres".
Переконайся, що сервіс db запущений і порт дійсно мапиться на 5432 (docker compose -f docker-compose.develop.yml ps). Якщо порт зайнятий локальним Postgres, змінюй мапу або зупини локальний.

// Додати схему та таблиці у ній
( echo "CREATE SCHEMA IF NOT EXISTS backend_ai; SET search_path TO backend_ai;"; cat db/migrations/001_create_ai_models.sql ) | docker compose -f docker-compose.develop.yml exec -T db psql -U postgres -d postgres
docker compose -f docker-compose.develop.yml exec db psql -U postgres -d postgres
Інтерактивно: у psql виконай SET search_path TO backend_ai;
і далі: \dt, \d ai_models.

// Check all Schemas
Одним рядком: docker compose -f docker-compose.develop.yml exec db psql -U postgres -d postgres -c "\\dn"
(\dnS - разом з системними схемами - по дефолту /dn - їх ховає.)
Альтернатива SQL: SELECT schema_name FROM information_schema.schemata ORDER BY schema_name;

// Drop only DB Values
If you want to keep Redis data while wiping Postgres only, replace step 4 with docker compose -f docker-compose.develop.yml rm -svf db && docker volume rm $(docker volume ls -q | grep supabase_db_data).

// Drop all Values
docker compose -f docker-compose.develop.yml down -v

// Migrations

// Supabase
8 - Підняти локально Supabase
9 - Додати зміни через UI ( Studio │ http://127.0.0.1:54323 ).
10 - Створити автоматичну міграцію з нових схем у бд. Накатити Міграції.
11 - Створити міграцію та додати у неї SQL.
12 - Залінкувати remote DB. (Project ID - evyllttuifftofzucyed)
13 - Зробити снепшот / накатити міграції на remote Supabase
14 - Зробити зміни на remote Supabase та створити міграцію і накатити на локальний Supabase.
15 - Накатити міграцію на Локальний postgres (in docker-compose-develop.yaml)

Supabase кроки (команди з кореня репо, використовуємо вбудований CLI npm run supabase -- …)

Підняти локальний Supabase: npm run supabase -- start (БД на 127.0.0.1 (line 54322), Studio піде на 54323).
Внести зміни через UI: відкрий http://127.0.0.1:54323 (наприклад, 127.0.0.1 (line 54323)).
Згенерувати авто-міграцію з локальних змін і накатити локально:
npm run supabase -- db diff -f backend*ai_changes
npm run supabase -- db push --db-url "postgresql://postgres:postgres@127.0.0.1:54322/postgres" (без дропа даних; якщо ок з дропом — npm run supabase -- db reset).
Створити порожню міграцію й додати свій SQL:
npm run supabase -- migration new custom_sql_patch → відредагуй створений <timestamp>\_custom_sql_patch.sql
npm run supabase -- db push --db-url "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
Залінкувати remote (Project ID evyllttuifftofzucyed):
npm run supabase -- login (введи ACCESS TOKEN) // Зайди на https://app.supabase.com → профіль (аватар) → Account Settings → Access Tokens → Generate new token.
npm run supabase -- link --project-ref evyllttuifftofzucyed
Снепшот і накатити міграції на remote:
Снепшот: remote.sql
Накатити міграції: npm run supabase -- db push --project-ref evyllttuifftofzucyed
Після змін напряму на remote → зробити міграцію й застосувати локально:
npm run supabase -- db diff --project-ref evyllttuifftofzucyed -f remote_changes
npm run supabase -- db push --db-url "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
Накатити міграцію на локальний Postgres із docker-compose.develop.yml:
<timestamp>*<name>.sql | docker compose -f docker-compose.develop.yml exec -T db psql -U postgres -d postgres

## Work

npm run supabase -- db reset
