import * as fs from 'fs';
import * as path from 'path';

const COMBINE_CHECK_LUA_FILE_PATH = path.resolve(__dirname, './luaScripts/combinedCheckAndAcquire.lua');
const CONSUME_LIMITS_LUA_FILE_PATH = path.resolve(__dirname, './luaScripts/consumeExecutionLimits.lua');
const combinedCheckAndAcquire: string = fs.readFileSync(COMBINE_CHECK_LUA_FILE_PATH, 'utf8');
const consumeExecutionLimits: string = fs.readFileSync(CONSUME_LIMITS_LUA_FILE_PATH, 'utf8');

export const luaScripts = {
  // API-side: only user RPD + user concurrency
  combinedCheckAndAcquire,

  // Worker-side: model RPM/RPD + optional user RPD consume
  consumeExecutionLimits,
};
