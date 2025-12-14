import type { Mode } from '../types/mode';
import { isHardMode } from '../utils/mode';

export interface ModelChain {
  requestedModel: string;
  fallbackModels: string[];
}

export const resolveModelChain = (mode: Mode): ModelChain => {
  const isHardPreferred = isHardMode(mode);

  if (isHardPreferred) {
    return {
      requestedModel: 'pro2dot5',
      fallbackModels: ['flash', 'flashPreview'],
    };
  }

  return {
    requestedModel: 'flashLite',
    fallbackModels: ['flashLitePreview', 'flashPreview'],
  };
};

export const modelsByType = {
  hard: ['pro2dot5'],
  light: ['flash', 'flashPreview', 'flashLite', 'flashLitePreview', 'flashPreview'],
};
