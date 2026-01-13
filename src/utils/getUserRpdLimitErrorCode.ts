import { userLimitError } from '../constants/limitErrors';

export const getUserRpdLimitErrorCode = (modelType: 'lite' | 'hard') =>
  `${userLimitError.USER_RPD_LIMIT}:${modelType}` as const;
