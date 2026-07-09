export interface RateSample {
  value: number;
  timestamp: Date;
}

export interface IntegratedTotal {
  total: number;
  observedSeconds: number;
  averageRate: number;
}

export interface IntegratedBucket extends IntegratedTotal {
  start: Date;
  end: Date;
}

const HOUR_MS = 3_600_000;

function sortedSamples(samples: RateSample[], start: Date, end: Date): RateSample[] {
  return samples
    .filter((sample) => sample.timestamp >= start && sample.timestamp <= end)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

export function integrateRateSamples(
  samples: RateSample[],
  start: Date,
  end: Date
): IntegratedTotal {
  const sorted = sortedSamples(samples, start, end);
  let total = 0;
  let observedSeconds = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const intervalStartMs = Math.max(current.timestamp.getTime(), start.getTime());
    const intervalEndMs = Math.min(next?.timestamp.getTime() ?? end.getTime(), end.getTime());

    if (intervalEndMs <= intervalStartMs) continue;

    const seconds = (intervalEndMs - intervalStartMs) / 1000;
    observedSeconds += seconds;
    total += current.value * (seconds / 3600);
  }

  return {
    total,
    observedSeconds,
    averageRate: observedSeconds > 0 ? total / (observedSeconds / 3600) : 0,
  };
}

export function integrateRateSamplesByHour(
  samples: RateSample[],
  start: Date,
  end: Date
): IntegratedBucket[] {
  const sorted = sortedSamples(samples, start, end);
  const buckets = new Map<number, IntegratedBucket>();

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    let cursorMs = Math.max(current.timestamp.getTime(), start.getTime());
    const intervalEndMs = Math.min(next?.timestamp.getTime() ?? end.getTime(), end.getTime());

    while (intervalEndMs > cursorMs) {
      const bucketStartMs = Math.floor(cursorMs / HOUR_MS) * HOUR_MS;
      const bucketEndMs = bucketStartMs + HOUR_MS;
      const segmentEndMs = Math.min(bucketEndMs, intervalEndMs);
      const seconds = (segmentEndMs - cursorMs) / 1000;
      const bucket = buckets.get(bucketStartMs) ?? {
        start: new Date(bucketStartMs),
        end: new Date(bucketEndMs),
        total: 0,
        observedSeconds: 0,
        averageRate: 0,
      };

      bucket.total += current.value * (seconds / 3600);
      bucket.observedSeconds += seconds;
      buckets.set(bucketStartMs, bucket);
      cursorMs = segmentEndMs;
    }
  }

  return [...buckets.values()]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((bucket) => ({
      ...bucket,
      averageRate: bucket.observedSeconds > 0 ? bucket.total / (bucket.observedSeconds / 3600) : 0,
    }));
}
