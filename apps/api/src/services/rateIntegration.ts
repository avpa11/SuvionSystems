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
export const DEFAULT_MAX_SAMPLE_AGE_MS = 300_000;

/** A sample is held for at most maxSampleAgeMs; gaps are unobserved, not zero use. */
function intervals(
  samples: RateSample[],
  start: Date,
  end: Date,
  maxSampleAgeMs: number,
) {
  if (!Number.isFinite(maxSampleAgeMs) || maxSampleAgeMs <= 0)
    throw new RangeError("maxSampleAgeMs must be positive");
  const sorted = samples
    .filter(
      (sample) =>
        Number.isFinite(sample.value) &&
        sample.value >= 0 &&
        Number.isFinite(sample.timestamp.getTime()) &&
        sample.timestamp.getTime() >= start.getTime() - maxSampleAgeMs &&
        sample.timestamp <= end,
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return sorted
    .map((sample, index) => ({
      value: sample.value,
      startMs: Math.max(sample.timestamp.getTime(), start.getTime()),
      endMs: Math.min(
        sorted[index + 1]?.timestamp.getTime() ?? end.getTime(),
        end.getTime(),
        sample.timestamp.getTime() + maxSampleAgeMs,
      ),
    }))
    .filter((interval) => interval.endMs > interval.startMs);
}

export function integrateRateSamples(
  samples: RateSample[],
  start: Date,
  end: Date,
  maxSampleAgeMs = DEFAULT_MAX_SAMPLE_AGE_MS,
): IntegratedTotal {
  let total = 0;
  let observedSeconds = 0;
  for (const interval of intervals(samples, start, end, maxSampleAgeMs)) {
    const seconds = (interval.endMs - interval.startMs) / 1000;
    total += (interval.value * seconds) / 3600;
    observedSeconds += seconds;
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
  end: Date,
  maxSampleAgeMs = DEFAULT_MAX_SAMPLE_AGE_MS,
): IntegratedBucket[] {
  const buckets = new Map<number, IntegratedBucket>();
  for (const interval of intervals(samples, start, end, maxSampleAgeMs)) {
    let cursorMs = interval.startMs;
    while (cursorMs < interval.endMs) {
      const bucketStartMs = Math.floor(cursorMs / HOUR_MS) * HOUR_MS;
      const bucketEndMs = Math.min(bucketStartMs + HOUR_MS, end.getTime());
      const segmentEndMs = Math.min(bucketEndMs, interval.endMs);
      const seconds = (segmentEndMs - cursorMs) / 1000;
      const bucket = buckets.get(bucketStartMs) ?? {
        start: new Date(Math.max(bucketStartMs, start.getTime())),
        end: new Date(bucketEndMs),
        total: 0,
        observedSeconds: 0,
        averageRate: 0,
      };
      bucket.total += (interval.value * seconds) / 3600;
      bucket.observedSeconds += seconds;
      buckets.set(bucketStartMs, bucket);
      cursorMs = segmentEndMs;
    }
  }
  return [...buckets.values()]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((bucket) => ({
      ...bucket,
      averageRate: bucket.total / (bucket.observedSeconds / 3600),
    }));
}
