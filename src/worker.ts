import { Worker, QueueEvents } from 'bullmq';
import { redisKeys } from './redis/keys';
import { env } from './config/env';
import { createRedisClient } from './redis/client';
// 💡 Тепер імпортуємо оновлений сервіс
import { ModelProviderService } from './ai/ModelProviderService'; 
import { getSecondsUntilMidnightPT, getCurrentDatePT } from './utils/time';
import { startCron, stopCron } from './cron';

const redis = createRedisClient();
const modelProvider = new ModelProviderService();

const MINUTE_TTL = 70;

const removeLock = async (userId: string, jobId: string) => {
  await redis.zrem(redisKeys.userActiveJobs(userId), jobId);
};

const returnTokens = async (userId: string, model: string) => {
  const dayTtl = getSecondsUntilMidnightPT();
  const todayPT = getCurrentDatePT();
  
  const pipeline = redis.pipeline();
  
  // Model RPM
  pipeline.decrby(redisKeys.modelRpm(model), 1);
  pipeline.expire(redisKeys.modelRpm(model), MINUTE_TTL);
  
  // Model RPD
  pipeline.decrby(redisKeys.modelRpd(model), 1);
  pipeline.expire(redisKeys.modelRpd(model), dayTtl);
  
  // User RPM
  pipeline.decrby(redisKeys.userModelRpm(userId, model), 1);
  pipeline.expire(redisKeys.userModelRpm(userId, model), MINUTE_TTL);

  // User RPD (Fixed Window)
  pipeline.decrby(redisKeys.userModelRpd(userId, model, todayPT), 1);

  await pipeline.exec();
};

const worker = new Worker(
  env.queueName,
  async (job) => {
    const {
      userId,
      model, // 💡 Це модель, за яку списано токени
      payload,
    } = job.data as any;
    const jobId = job.id as string;

    await redis.hset(redisKeys.jobMeta(jobId), {
      status: 'in_progress',
      updated_at: new Date().toISOString(),
    });

    try {
      // 💡 Викликаємо спрощений метод execute, без fallback-ланцюжка
      const result = await modelProvider.execute({
        model,
        cvDescription: payload.cvDescription,
        jobDescription: payload.jobDescription,
        mode: payload.mode,
        locale: payload.locale,
      });

      // Успішне завершення
      await redis.hset(redisKeys.jobMeta(jobId), {
        processed_model: result.usedModel, // Буде така ж, як 'model'
      });

      await redis.hset(redisKeys.jobResult(jobId), {
        status: 'completed',
        data: result.text,
        finished_at: new Date().toISOString(),
        used_model: result.usedModel,
      });
      await removeLock(userId, jobId);
    } catch (err: any) {
      // 💡 Якщо помилка 'retryable=true' (429/5xx), BullMQ перехопить і поставить на delayed.
      // Якщо 'retryable' немає або 'false' (4xx), BullMQ переведе у 'failed'.

      if (!(err as any).retryable) {
        // Якщо це остаточна (не-retryable) помилка, записуємо результат і знімаємо лок.
        await redis.hset(redisKeys.jobResult(jobId), {
          status: 'failed',
          error: err?.message || 'Unknown error',
          finished_at: new Date().toISOString(),
        });
        await removeLock(userId, jobId);
      }
      
      // Кидаємо виняток для BullMQ, щоб він керував retry / фінальним failed
      throw err; 
    }
  },
  { connection: { url: env.redisUrl } }
);

const queueEvents = new QueueEvents(env.queueName, {
  connection: { url: env.redisUrl },
});

void startCron().catch((err) => {
  console.error('Cron failed to start inside worker', err);
});

queueEvents.on('failed', async ({ jobId, failedReason }) => {
  // 💡 Централізоване очищення після вичерпання спроб BullMQ
  const meta = await redis.hgetall(redisKeys.jobMeta(jobId as string));
  
  const userId = meta.user_id;
  const model = meta.processed_model || meta.requested_model; 
  
  if (userId && model) {
      removeLock(userId, jobId)
      // 💡 Повернення токенів при фінальному провалі
      await returnTokens(userId, model); 
  }

  // Фінальний запис статусу
  await redis.hset(redisKeys.jobResult(jobId as string), {
    status: 'failed',
    error: failedReason,
    finished_at: new Date().toISOString(),
  });
});

const shutdown = async () => {
  await worker.close();
  await queueEvents.close();
  await redis.quit();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
