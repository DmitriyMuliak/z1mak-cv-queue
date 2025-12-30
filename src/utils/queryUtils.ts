export const numberFromQuery = (value: unknown, fallback: number): number => {
  const parsed =
    typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};
