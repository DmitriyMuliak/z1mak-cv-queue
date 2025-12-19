1 -

# -f (file) — вказує шлях до SQL файлу

# -v ON_ERROR_STOP=1 — зупинить виконання, якщо в SQL є помилка (best practice)

psql -U postgres -d target_db -f /path/to/script.sql -v ON_ERROR_STOP=1

# -it: інтерактивний режим

# -u postgres: запуск від імені системного юзера postgres всередині Linux в контейнері

docker exec -it 5140f072ae7d psql -U postgres -d postgres -f ./db/migrations/000_enable_extensions.sql -v ON_ERROR_STOP=1

C:\Users\User\Desktop\z1mak-cv-queue\db\migrations\000_enable_extensions.sql

...
import fp from 'fastify-plugin';
import { db } from './pgClient'; // ваш файл

export default fp(async (fastify) => {
// Додаємо вашу абстракцію в інстанс fastify
fastify.decorate('db', db);

// Грейсфул шатдаун: коли fastify зупиняється, закриваємо пул
fastify.addHook('onClose', async () => {
await db.end();
});
});

import { db } from '../pgClient';
import { Redis } from 'ioredis';

declare module 'fastify' {
interface FastifyInstance {
db: typeof db;
redis: Redis;
}
}

CREATE SCHEMA backend_ai;

CREATE TABLE backend_ai.analysis_queue (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
data jsonb,
status text
);
