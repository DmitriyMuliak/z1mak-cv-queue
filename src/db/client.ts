import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

type QueryResult<T> = { rows: T[] };

type BoundClient = {
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<QueryResult<T>>;
  release: () => Promise<void>;
};

class SupabaseMockClient {
  private client?: SupabaseClient;
  private warnedMissing = false;
  private warnedNotImplemented = false;

  constructor() {
    if (env.supabaseUrl && env.supabaseKey) {
      this.client = createClient(env.supabaseUrl, env.supabaseKey);
    }
  }

  get isMock(): boolean {
    return !this.client;
  }

  private warnMissingConnection() {
    if (this.warnedMissing) return;
    this.warnedMissing = true;
    console.warn(
      '[SupabaseMock] SUPABASE_URL/KEY not provided, using no-op mock client.'
    );
  }

  private warnNotImplemented(sql: string) {
    if (this.warnedNotImplemented) return;
    this.warnedNotImplemented = true;
    console.warn(
      `[SupabaseMock] Query passthrough not implemented yet. SQL received: ${sql}`
    );
  }

  async query<T = unknown>(sql: string, _params?: unknown[]): Promise<QueryResult<T>> {
    void _params;
    if (!this.client) {
      this.warnMissingConnection();
      return { rows: [] as T[] };
    }

    this.warnNotImplemented(sql);
    return { rows: [] as T[] };
  }

  async connect(): Promise<BoundClient> {
    return {
      query: <T = unknown>(sql: string, params?: unknown[]) => this.query<T>(sql, params),
      release: async () => {},
    };
  }

  async end(): Promise<void> {
    // supabase-js has no explicit connection pool to close; noop for parity with pg.Pool
    return;
  }
}

export const supabaseClient = new SupabaseMockClient();
