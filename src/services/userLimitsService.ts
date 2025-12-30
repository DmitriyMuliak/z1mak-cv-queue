import Redis from 'ioredis';
import { redisKeys } from '../redis/keys';
import { UserLimits } from './limitsCache';
import { db } from '../db/client';

export const updateLimits = async (
  redis: Redis,
  userId: string,
  newLimits: Partial<UserLimits>
) => {
  throw Error('Tried to call [updateLimits]. Update user limits - is not implemented');
  await db.query(`UPDATE user_limits SET hard_rpd = $1, ... WHERE user_id = $2`, [
    newLimits.hard_rpd,
    userId,
  ]);

  const key = redisKeys.userLimits(userId);
  await redis.hset(key, {
    //
  });

  return true;
};
