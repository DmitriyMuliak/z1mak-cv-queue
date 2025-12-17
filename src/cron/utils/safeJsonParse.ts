export const safeJsonParse = <T = unknown>(val: string | undefined): T | null => {
  if (!val) return null;
  try {
    return JSON.parse(val) as T;
  } catch {
    return null;
  }
};
