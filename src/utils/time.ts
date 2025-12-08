import { DateTime } from 'luxon';

export const getSecondsUntilMidnightPT = (): number => {
  const now = new Date();
  const ptString = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const ptNow = new Date(ptString);

  const midnight = new Date(ptNow);
  midnight.setHours(24, 0, 0, 0);

  const diffMs = midnight.getTime() - ptNow.getTime();
  const seconds = Math.max(1, Math.floor(diffMs / 1000));
  return seconds;
};

export const getCurrentDatePT = (): string => {
  return DateTime.now().setZone('America/Los_Angeles').toFormat('yyyy-MM-dd');
};
