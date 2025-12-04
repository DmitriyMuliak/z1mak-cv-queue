import { Worker, QueueEvents } from "bullmq";
import { redisKeys } from "./redis/keys";
import { env } from "./config/env";
import { createRedisClient } from "./redis/client";
import { ModelProviderService } from "./ai/ModelProviderService";

const redis = createRedisClient();
const modelProvider = new ModelProviderService();

const worker = new Worker(
  env.queueName,
  async (job) => {
    const { userId, model, fallbackModels = [], payload, role } = job.data as any;
    const jobId = job.id as string;

    await redis.hset(redisKeys.jobMeta(jobId), {
      status: "in_progress",
      updated_at: new Date().toISOString(),
    });

    try {
      const result = await modelProvider.executeWithFallback({
        model,
        fallbackModels,
        cvDescription: payload.cvDescription,
        jobDescription: payload.jobDescription,
        mode: payload.mode,
        locale: payload.locale,
      });

      await redis.hset(redisKeys.jobResult(jobId), {
        status: "completed",
        data: result.text,
        finished_at: new Date().toISOString(),
        used_model: result.usedModel,
      });
      await removeLock(userId, jobId);
    } catch (err: any) {
      const status = err?.status as number | undefined;
      const retryable = err?.retryable || status === 429 || (status ?? 0) >= 500;

      if (retryable && job.attemptsMade < (job.opts.attempts ?? 0)) {
        const delayUntil = Date.now() + 5000;
        await job.moveToDelayed(delayUntil);
        return;
      }

      await redis.hset(redisKeys.jobResult(jobId), {
        status: "failed",
        error: err?.message || "Unknown error",
        finished_at: new Date().toISOString(),
      });
      await removeLock(userId, jobId);
    }
  },
  { connection: { url: env.redisUrl } }
);

const queueEvents = new QueueEvents(env.queueName, {
  connection: { url: env.redisUrl },
});

queueEvents.on("failed", async ({ jobId, failedReason }) => {
  await redis.hset(redisKeys.jobResult(jobId as string), {
    status: "failed",
    error: failedReason,
    finished_at: new Date().toISOString(),
  });
});

const removeLock = async (userId: string, jobId: string) => {
  await redis.zrem(redisKeys.userActiveJobs(userId), jobId);
};

const shutdown = async () => {
  await worker.close();
  await queueEvents.close();
  await redis.quit();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
