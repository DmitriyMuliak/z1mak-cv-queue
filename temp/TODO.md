// Plan

// Локальний postgres (docker container - docker-compose-develop.yaml)
1 - Локально підняти postgress у docker-compose-develop.yaml (done)
2 - Внести зміни у БД та зберегти Volume (запустити 001_create_ai_models.sql)
3 - Зупинити БД та Запустити знову щоб поперелні зміни були доступні
4 - Зупинити контейнер та витерти всі Volume
5 - Створити міграцію під Schema.backend_ai (запустити 001_create_ai_models.sql)
6 - Підняти Локальний postgres.
7 - Накатити міграції та перевірити структуру БД чи вона відповідає очікуваній схемі.
(DONE)

// Supabase
8 - Підняти локально Supabase
9 - Додати зміни через UI ( Studio │ http://127.0.0.1:54323 ).
10 - Створити автоматичну міграцію з нових схем у бд. Накатити Міграції.
11 - Створити міграцію та додати у неї SQL.
12 - Залінкувати remote DB. (Project ID - evyllttuifftofzucyed)
13 - Зробити снепшот / накатити міграції на remote Supabase
14 - Зробити зміни на remote Supabase та створити міграцію і накатити на локальний Supabase.
15 - Накатити міграцію на Локальний postgres (in docker-compose-develop.yaml)

// Future plans:
01 - Proceed from: 5 - Revise ENV variables and clean it in docker-compose file.

// Back-end
1 - Create new Project for DB. (done)
2 - Setup local db connect for testing proposes. (done)
3 - Connect to new DB.
4 - Update DB Schema. (create new Schema for BE) ---------------- 1
5 - Revise ENV variables and clean it in docker-compose file. --- 2
6 - Add mechanism for keep old precessed resume for some time. -- 3
7 - Revise update user limits logic. (add endpoint) ------------- 4
8 - Get from redis if not exist get from DB and put to the cache. - 5
9 - Update limits and models (actualize data from google).
10 - Create fly.io config
11 - Revise auto restart for processes with fly.io and without.
12 - Create pipeline for github.
13 - Merge on master.
14 - Buy VPS.

// Front-end

1 - Remove logic related to call AI. + ping next > service if have tasks in progress.
2 - Call Resume service.
3 - Small Refactor.
4 - Add Base unit test.
5 - Add Playwright test for main(full) flow.
6 - Add github pipeline.
7 - Change main bg colors.
8 - Revise texts.
9 - Add button + popup with history links (by UserID -> JobID) -> click -> Show resume analyze.
