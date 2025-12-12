import * as fs from 'fs';
import * as path from 'path';

const COMBINE_CHECK_LUA_FILE_PATH = path.resolve(__dirname, './luaScripts/combinedCheckAndAcquire.lua');
const CONSUME_LIMITS_LUA_FILE_PATH = path.resolve(__dirname, './luaScripts/consumeExecutionLimits.lua');
const RETURN_TOKENS_LUA_FILE_PATH = path.resolve(__dirname, './luaScripts/returnTokensAtomic.lua');
const EXPIRE_STALE_JOB_LUA_FILE_PATH = path.resolve(__dirname, './luaScripts/expireStaleJob.lua');
const DECR_AND_CLAMP_LUA_FILE_PATH = path.resolve(__dirname, './luaScripts/decrAndClampToZero.lua');
const combinedCheckAndAcquire: string = fs.readFileSync(COMBINE_CHECK_LUA_FILE_PATH, 'utf8');
const consumeExecutionLimits: string = fs.readFileSync(CONSUME_LIMITS_LUA_FILE_PATH, 'utf8');
const returnTokensAtomic: string = fs.readFileSync(RETURN_TOKENS_LUA_FILE_PATH, 'utf8');
const expireStaleJob: string = fs.readFileSync(EXPIRE_STALE_JOB_LUA_FILE_PATH, 'utf8');
const decrAndClampToZero: string = fs.readFileSync(DECR_AND_CLAMP_LUA_FILE_PATH, 'utf8');

export const luaScripts = {
  // API-side: only user RPD + user concurrency
  combinedCheckAndAcquire,

  // Worker-side: model RPM/RPD (user RPD is consumed at the API layer)
  consumeExecutionLimits,

  // Atomic token return (model/user)
  returnTokensAtomic,

  // Atomic cleanup of stale jobs
  expireStaleJob,

  // Atomic decr and clamp to zero
  decrAndClampToZero,
};
