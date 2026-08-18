export const MAX_DISPATCH_BATCH = 12;

export function normalizeBatchSize(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 8;
  return Math.min(parsed, MAX_DISPATCH_BATCH);
}

export function createSchedule(source, now = new Date()) {
  const scheduledFor = new Date(source.next_fetch_at);
  const intervalSeconds = Number(source.interval_seconds);
  if (!source.id || Number.isNaN(scheduledFor.valueOf()) || !Number.isInteger(intervalSeconds) || intervalSeconds < 60) {
    throw new Error('Invalid source schedule');
  }
  const nextBase = Math.max(now.valueOf(), scheduledFor.valueOf());
  return {
    sourceId: source.id,
    scheduledFor: scheduledFor.toISOString(),
    nextFetchAt: new Date(nextBase + intervalSeconds * 1000).toISOString(),
  };
}
