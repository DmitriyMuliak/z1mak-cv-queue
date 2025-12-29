import { Pool, PoolClient, QueryResult, QueryResultRow, PoolConfig } from 'pg';
import { env } from '../config/env';

// Convenience type alias
export type DbClient = PoolClient;

// Hosts where SSL is not required
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

// LOCAL_HOSTS: local dev (host machine). "db": docker-compose service host when TEST_USE_COMPOSE is enabled.
const isLocalHost = (hostname: string) => {
  return (
    LOCAL_HOSTS.has(hostname) ||
    (process.env.TEST_USE_COMPOSE !== '0' && hostname === 'db')
  );
};

const createPool = (): Pool => {
  const connectionString = env.supabaseUrl;

  if (!connectionString) {
    // Fail fast on startup if the URL is missing instead of guessing later
    throw new Error('[Supabase] DATABASE_URL is missing inside env config.');
  }

  let config: PoolConfig = { connectionString };

  try {
    const url = new URL(connectionString);
    const isLocal = isLocalHost(url.hostname);
    const sslMode = url.searchParams.get('sslmode');
    const sslDisabled = sslMode === 'disable' || url.searchParams.get('ssl') === 'false';

    config = {
      ...config,
      ssl: sslDisabled || isLocal ? false : { rejectUnauthorized: true },
      // Recommended settings for worker/server
      max: 10, // Max clients in pool (Supabase limit 15)
      idleTimeoutMillis: 30000,
      allowExitOnIdle: true, // Allow process exit even if we have some idle connections
      connectionTimeoutMillis: 5000, // Fail if DB doesn't respond within 5s
    };
  } catch (err) {
    console.error('[Supabase] Invalid DATABASE_URL provided', err);
    throw err;
  }

  const pool = new Pool(config);

  // Log pool errors (e.g., DB dropped connections during runtime)
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    // process.exit(-1); // Uncomment to force a hard restart
  });

  return pool;
};

// Initialize the pool once (singleton)
const pool = createPool();

export const isConnected = async (): Promise<boolean> => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

/**
 * Executes a single query.
 * Automatically borrows a client from the pool and releases it.
 */
export const query = async <T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> => {
  return pool.query<T>(sql, params);
};

/**
 * Gets a client for manual control (rarely needed; prefer withClient).
 * You MUST call release()!
 */
export const connect = async (): Promise<PoolClient> => {
  return pool.connect();
};

/**
 * Closes the pool (for graceful shutdown)
 */
export const end = async (): Promise<void> => {
  await pool.end();
};

/**
 * Transaction wrapper.
 * Automatically runs BEGIN/COMMIT/ROLLBACK.
 */
export const withTransaction = async <T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Wrapper for multiple queries within one session (without a transaction).
 */
export const withClient = async <T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
};

// Export as db/pgClient to avoid confusion with supabase-js
export const db = {
  query,
  connect,
  end,
  withTransaction,
  withClient,
  isConnected,
  getPool: () => pool, // sometimes useful to access the underlying pool
};
