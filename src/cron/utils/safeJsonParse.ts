export const safeJsonParse = (val: string | undefined) => {
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
};
