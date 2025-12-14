import type { Mode } from '../../types/mode';

export const isByJob = (mode: Mode): boolean => mode.evaluationMode === 'byJob';

export const isDeep = (mode: Mode): boolean => mode.depth === 'deep';

export const isHardMode = (mode: Mode): boolean => isByJob(mode) && isDeep(mode);

export const isCommonDomain = (mode: Mode): boolean => mode.domain === 'common';

export const getModeType = (mode: Mode): 'hard' | 'lite' =>
  isHardMode(mode) ? 'hard' : 'lite';
