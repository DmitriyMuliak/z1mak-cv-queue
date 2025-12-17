export interface EnvConfig {
  redisUrl: string;
  pgUrl?: string;
  queueLiteName: string;
  queueHardName: string;
  internalApiKey?: string;
  port: number;
  supabaseUrl?: string;
  supabaseKey?: string;
  isProduction: boolean;
}

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolvePgUrl = (): string | undefined => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // Supabase CLI exposes this when running `supabase start`
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  // Fallback for local Supabase defaults (54322) when only SUPABASE_URL is set.
  if (
    process.env.SUPABASE_URL?.includes('127.0.0.1') ||
    process.env.SUPABASE_URL?.includes('localhost')
  ) {
    return 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  }
  return undefined;
};

export const env: EnvConfig = {
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  pgUrl: resolvePgUrl(),
  queueLiteName: process.env.BULLMQ_QUEUE_LITE || 'ai-jobs-lite',
  queueHardName: process.env.BULLMQ_QUEUE_HARD || 'ai-jobs-hard',
  internalApiKey: process.env.INTERNAL_API_KEY,
  port: numberFromEnv(process.env.PORT, 4000),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  isProduction: process.env.NODE_ENV === 'production',
};
