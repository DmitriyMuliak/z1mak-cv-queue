export interface EnvConfig {
  redisUrl: string;
  pgUrl?: string;
  queueName: string;
  internalApiKey?: string;
  port: number;
}

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env: EnvConfig = {
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  pgUrl: process.env.DATABASE_URL,
  queueName: process.env.BULLMQ_QUEUE || "ai-jobs",
  internalApiKey: process.env.INTERNAL_API_KEY,
  port: numberFromEnv(process.env.PORT, 4000),
};
