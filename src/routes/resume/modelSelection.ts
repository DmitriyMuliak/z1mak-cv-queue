import { redisKeys } from '../../redis/keys';
import { AcquireCode } from '../../types/queueCodes';
import type { RedisWithScripts } from '../../redis/client';
import type { UserLimits } from '../../services/limitsCache';
import type { ModeType } from '../../types/mode';
import type { aiModelIds } from '../../types/ai-models';

type SelectionError = 'CONCURRENCY_LIMIT' | 'USER_RPD_LIMIT' | 'MODEL_LIMIT';

export type ModelSelectionResult =
  | {
      status: 'selected';
      model: aiModelIds;
      modelRpm: number;
      modelRpd: number;
    }
  | { status: 'error'; error: SelectionError };

type SelectParams = {
  redis: RedisWithScripts;
  modelChain: aiModelIds[];
  userId: string;
  isAdmin: boolean;
  userLimits: UserLimits;
  modeType: ModeType;
  todayPT: string;
  dayTtl: number;
  now: number;
  jobId: string;
  concurrencyTtlSeconds: number;
};

export const selectAvailableModel = async ({
  redis,
  modelChain,
  userId,
  isAdmin,
  userLimits,
  modeType,
  todayPT,
  dayTtl,
  now,
  jobId,
  concurrencyTtlSeconds,
}: SelectParams): Promise<ModelSelectionResult> => {
  for (const candidate of modelChain) {
    const modelLimits = await redis.hgetall(redisKeys.modelLimits(candidate));

    // Check for deleted models from DB
    if (!modelLimits || Object.keys(modelLimits).length === 0) {
      continue;
    }

    const modelRpm = Number(modelLimits.rpm ?? 0);
    const modelRpd = Number(modelLimits.rpd ?? 0);
    const userDayLimit = isAdmin
      ? 0
      : modeType === 'hard'
        ? (userLimits.hard_rpd ?? 0)
        : (userLimits.lite_rpd ?? 0);
    const concurrencyLimit = isAdmin ? 0 : (userLimits.max_concurrency ?? 0);

    const code = await redis.combinedCheckAndAcquire(
      [
        redisKeys.userTypeRpd(userId, modeType, todayPT),
        redisKeys.userActiveJobs(userId),
        redisKeys.modelRpd(candidate),
      ],
      [
        userDayLimit,
        concurrencyLimit,
        dayTtl,
        concurrencyTtlSeconds,
        1,
        now,
        jobId,
        modelRpd,
        dayTtl,
      ]
    );

    if (code === AcquireCode.OK) {
      return { status: 'selected', model: candidate, modelRpm, modelRpd };
    }
    if (code === AcquireCode.ModelRpdExceeded) {
      continue;
    }
    if (code === AcquireCode.ConcurrencyExceeded) {
      return { status: 'error', error: 'CONCURRENCY_LIMIT' };
    }
    if (code === AcquireCode.UserRpdExceeded) {
      return { status: 'error', error: 'USER_RPD_LIMIT' };
    }
  }

  return { status: 'error', error: 'MODEL_LIMIT' };
};
