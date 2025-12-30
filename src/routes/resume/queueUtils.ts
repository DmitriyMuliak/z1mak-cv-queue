const MAX_WAIT_MINUTES = 30;
const QUEUE_BUFFER = 0.9;

export const AVG_SECONDS = { hard: 25, lite: 15 };

export const computeMaxQueueLength = (rpm: number, rpd: number, avgSeconds: number) => {
  const rpmSafe = Math.max(rpm, 0);
  const perMinuteByDuration = avgSeconds > 0 ? 60 / avgSeconds : rpmSafe;
  const perMinute = Math.min(rpmSafe, perMinuteByDuration);
  const raw = Math.ceil(perMinute * MAX_WAIT_MINUTES * QUEUE_BUFFER);
  const dayCap = rpd > 0 ? rpd : raw;
  return Math.max(1, Math.min(raw, dayCap));
};
