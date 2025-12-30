import type { Mode } from '../types/mode';

export type ModeType = 'hard' | 'lite';

export interface JobPayload {
  jobId: string;
  userId: string;
  requestedModel: string;
  model: string;
  payload: {
    cvDescription: string;
    jobDescription?: string;
    mode: Mode;
    locale: string;
  };
  role: 'user' | 'admin';
  modeType: ModeType;
}

export type ProviderResult = {
  text: string;
  usedModel: string;
};
