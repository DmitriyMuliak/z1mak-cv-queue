import { aiModelIds } from '../types/ai-models';
import type { Mode } from '../types/mode';
import { isHardMode } from '../utils/mode';

export interface ModelChain {
  requestedModel: aiModelIds;
  fallbackModels: aiModelIds[];
}

export const resolveModelChain = (mode: Mode): ModelChain => {
  const isHardPreferred = isHardMode(mode);

  if (isHardPreferred) {
    return {
      requestedModel: 'flash3',
      fallbackModels: ['flash', 'flashLite'],
    };
  }

  return {
    requestedModel: 'flashLite',
    fallbackModels: ['flash'],
  };
};

export const modelsByType = {
  hard: ['flash3'],
  light: ['flash', 'flashLite'],
};
