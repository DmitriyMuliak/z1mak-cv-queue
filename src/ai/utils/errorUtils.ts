export const extractStatus = (error: unknown): number | undefined => {
  if (!error) return undefined;

  const maybeObj = error as any;
  if (typeof maybeObj.status === 'number') return maybeObj.status;
  if (typeof maybeObj.code === 'number') return maybeObj.code;
  if (typeof maybeObj?.error?.code === 'number') return maybeObj.error.code;
  if (typeof maybeObj?.response?.status === 'number') return maybeObj.response.status;

  return undefined;
};

export const extractMessage = (error: unknown): string | undefined => {
  const maybeObj = error as any;
  if (typeof maybeObj === 'string') return maybeObj;
  if (typeof maybeObj?.message === 'string') return maybeObj.message;
  if (typeof maybeObj?.error?.message === 'string') return maybeObj.error.message;
  if (typeof maybeObj?.response?.data?.error?.message === 'string') {
    return maybeObj.response.data.error.message;
  }
  return undefined;
};

export const isContextTooLong = (message?: string): boolean => {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('context too long') ||
    lower.includes('input context is too long') ||
    lower.includes('too large') ||
    lower.includes('exceeds')
  );
};
