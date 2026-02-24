import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

const migrationsDir = path.resolve(__dirname, 'migrations');
const defaultDbUrl = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres?sslmode=disable';
const connectionString =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? defaultDbUrl;

const main = async () => {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const files = (await readdir(migrationsDir))
      .filter((name) => name.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    for (const fileName of files) {
      const filePath = path.join(migrationsDir, fileName);
      const sql = await readFile(filePath, 'utf8');
      if (!sql.trim()) {
        continue;
      }

      await client.query(sql);
      console.log(`[test:db:migrate] applied ${fileName}`);
    }
  } finally {
    await client.end();
  }
};

void main().catch((error) => {
  console.error('[test:db:migrate] failed', error);
  process.exit(1);
});
