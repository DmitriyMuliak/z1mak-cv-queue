Ось професійний переклад документації українською мовою, адаптований під твій стиль спілкування:

# Тестування (Tests)

Цей проєкт містить юніт-тести та інтеграційні тести. Юніт-тести працюють швидко завдяки використанню моків (mocks).
Інтеграційні тести піднімають Docker-сервіси (API, worker, Redis, Postgres, mock Gemini) та звертаються до реальних HTTP-ендпоїнтів.

## Юніт-тести (Unit tests)

- **Запуск:** `npm run test:unit`
- **Фреймворк:** Vitest
- **Моки:** розміщені в директорії `test/mock`
- **Конфігурація:** `vitest.config.ts` виключає `dist/**`, щоб уникнути запуску вже скомпілованих тестів.

## Інтеграційні тести (Integration tests)

- **Запуск:** `npm run test:integration`
- **Інструменти:** використовує Docker Compose (`docker-compose.test.yml`)
- **Сервіси:** `db` (Postgres), `redis`, `api`, `worker`, `mock-gemini`
- **Перевірка готовності:** API-check опитує `GET /health`, поки той не поверне статус 2xx.

Ключові перевизначення змінних оточення (див. `test/utils/rateTestUtils.ts`):

- `TEST_USE_COMPOSE=0` — пропустити запуск Docker Compose.
- `COMPOSE_FILE` — перевизначити файл compose.
- `TEST_API_URL` / `TEST_REDIS_URL` / `GEMINI_MOCK_CONFIG_URL` — налаштування URL-адрес.
- `TEST_INTERNAL_KEY` — ключ для внутрішньої автентифікації.

## Чому білд включає MockGeminiProvider

Інтеграційні контейнери запускають наступні файли з директорії `dist`:

- `dist/test/mock/MockGeminiProvider/registerGeminiMock.js`
- `dist/test/mock/MockGeminiProvider/geminiServer.js`

Через це `tsconfig.build.json` включає шлях `test/mock/MockGeminiProvider/**/*`, щоб ці файли компілювалися в `dist`. Усі інші тести виключені з результатів збірки (build output).

## Примітки (Notes)

- Перший запуск інтеграційних тестів може тривати довше через завантаження образів (image pulls) та білд контейнерів.
- У продакшні використовується зовнішній Supabase/Postgres; сервіс `db` існує виключно для потреб інтеграційних тестів.

---

**Чи потрібно мені також перевірити твій `docker-compose.test.yml` на предмет правильних лімітів ресурсів для цих тестів?**
