export interface EnvConfig {
  redisUrl: string;
  queueLiteName: string;
  queueHardName: string;
  port: number;
  internalApiKey?: string;
  supabaseUrl?: string;
  supabasePublicKey?: string;
  supabasePrivateKey?: string;
  isProduction: boolean;
}

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolvePgUrl = (): string | undefined => {
  if (
    process.env.SUPABASE_URL?.includes('127.0.0.1') ||
    process.env.SUPABASE_URL?.includes('localhost')
  ) {
    return 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  }
  return process.env.SUPABASE_URL;
};

export const env: EnvConfig = {
  supabaseUrl: resolvePgUrl(),
  supabasePublicKey: process.env.SUPABASE_PUBLISHEBLE_KEY,
  supabasePrivateKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  queueLiteName: process.env.BULLMQ_QUEUE_LITE || 'ai-jobs-lite',
  queueHardName: process.env.BULLMQ_QUEUE_HARD || 'ai-jobs-hard',
  internalApiKey: process.env.INTERNAL_API_KEY,
  port: numberFromEnv(process.env.PORT, 4000),
  isProduction: process.env.NODE_ENV === 'production',
};
