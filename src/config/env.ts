export interface EnvConfig {
  redisUrl: string;
  pgUrl?: string;
  queueLiteName: string;
  queueHardName: string;
  internalApiKey?: string;
  port: number;
  supabaseUrl?: string;
  supabaseKey?: string;
}

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env: EnvConfig = {
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  pgUrl: process.env.DATABASE_URL,
  queueLiteName: process.env.BULLMQ_QUEUE_LITE || 'ai-jobs-lite',
  queueHardName: process.env.BULLMQ_QUEUE_HARD || 'ai-jobs-hard',
  internalApiKey: process.env.INTERNAL_API_KEY,
  port: numberFromEnv(process.env.PORT, 4000),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
};
