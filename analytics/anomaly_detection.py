"""
Suvion Systems — Sensor Anomaly Detection
==========================================
Multivariate anomaly detection over the four persisted sensor streams
(fuel, generator, water, temperature) using the Isolation Forest in
``isolation_forest.py``.

Why multivariate: faults often show up as an unusual *combination* of readings
rather than any single value leaving its range — e.g. fuel flow normal but
generator current high, or temperature drifting while fuel holds steady. A
forest over the joint feature vector catches those; per-stream thresholds do
not.

Usage
-----
As a library::

    from anomaly_detection import SensorAnomalyDetector
    det = SensorAnomalyDetector(contamination=0.02, random_state=7).fit(rows)
    events = det.detect(rows)        # list[AnomalyEvent]

Against a live MongoDB (requires pymongo)::

    python anomaly_detection.py --mongo-uri mongodb://localhost:27017/suvion \\
        --lookback-minutes 1440

Each detected anomaly is appended as one JSON line to ``anomaly-events.log``
(mirroring the audit-log convention used by the API and retention jobs).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import statistics
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone

from isolation_forest import IsolationForest, Matrix

# The four streams persisted by the API (see apps/api schema enum). Order is
# fixed so feature vectors are positionally consistent across fit and detect.
STREAMS: tuple[str, ...] = ("fuel", "generator", "water", "temperature")

# A stream whose standardised value exceeds this many std-devs from the
# training mean is reported as "contributing" to an anomaly, to make events
# actionable (which sensor looks off, not just that something does).
_CONTRIB_Z = 2.0

LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "anomaly-events.log")


@dataclass
class AnomalyEvent:
    """A single flagged time bucket."""

    timestamp: str
    score: float
    is_anomaly: bool
    features: dict[str, float]
    contributing: list[str] = field(default_factory=list)


def align_readings(
    readings: list[dict], bucket_seconds: int = 1
) -> list[dict]:
    """
    Collapse flat ``{stream, value, timestamp}`` readings into time-bucketed
    feature rows ``{timestamp, fuel, generator, water, temperature}``.

    Readings are grouped by flooring their timestamp to ``bucket_seconds``; the
    most recent value per stream within a bucket wins. Only buckets that
    contain all four streams are returned, so every feature vector is complete.

    ``timestamp`` may be a ``datetime`` or an ISO-8601 string.
    """
    buckets: dict[int, dict] = {}
    for r in readings:
        ts = r["timestamp"]
        epoch = _to_epoch(ts)
        key = int(epoch // bucket_seconds) * bucket_seconds
        bucket = buckets.setdefault(key, {})
        bucket[r["stream"]] = float(r["value"])

    rows: list[dict] = []
    for key in sorted(buckets):
        bucket = buckets[key]
        if all(stream in bucket for stream in STREAMS):
            iso = datetime.fromtimestamp(key, tz=timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )
            rows.append({"timestamp": iso, **{s: bucket[s] for s in STREAMS}})
    return rows


def _to_epoch(ts) -> float:
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts.timestamp()
    # ISO-8601 string; tolerate a trailing 'Z'.
    text = str(ts).replace("Z", "+00:00")
    return datetime.fromisoformat(text).timestamp()


class SensorAnomalyDetector:
    """Isolation-Forest anomaly detector over aligned sensor feature rows."""

    def __init__(
        self,
        streams: tuple[str, ...] = STREAMS,
        n_estimators: int = 100,
        contamination: float | str = "auto",
        random_state: int | None = None,
        standardize: bool = True,
    ) -> None:
        self.streams = streams
        self.standardize = standardize
        self._forest = IsolationForest(
            n_estimators=n_estimators,
            contamination=contamination,  # type: ignore[arg-type]
            random_state=random_state,
        )
        self._mean: dict[str, float] = {}
        self._std: dict[str, float] = {}

    # ─── Feature engineering ──────────────────────────────────────────────────

    def _fit_scaler(self, rows: list[dict]) -> None:
        for s in self.streams:
            col = [float(r[s]) for r in rows]
            self._mean[s] = statistics.fmean(col)
            # Population std; guard against a constant stream (std 0 → 1) so we
            # never divide by zero when standardising.
            sd = statistics.pstdev(col) if len(col) > 1 else 0.0
            self._std[s] = sd if sd > 1e-9 else 1.0

    def _vectorize(self, row: dict) -> list[float]:
        if not self.standardize:
            return [float(row[s]) for s in self.streams]
        return [(float(row[s]) - self._mean[s]) / self._std[s] for s in self.streams]

    def _matrix(self, rows: list[dict]) -> Matrix:
        return [self._vectorize(r) for r in rows]

    # ─── Public API ───────────────────────────────────────────────────────────

    def fit(self, rows: list[dict]) -> "SensorAnomalyDetector":
        if not rows:
            raise ValueError("cannot fit on empty rows")
        if self.standardize:
            self._fit_scaler(rows)
        self._forest.fit(self._matrix(rows))
        return self

    def score(self, rows: list[dict]) -> list[float]:
        """Anomaly score in [0, 1] per row; higher = more anomalous."""
        return self._forest.score_samples(self._matrix(rows))

    def detect(self, rows: list[dict]) -> list[AnomalyEvent]:
        """Score every row and build an :class:`AnomalyEvent` for each."""
        scores = self.score(rows)
        flags = self._forest.predict(self._matrix(rows))
        events: list[AnomalyEvent] = []
        for row, sc, flag in zip(rows, scores, flags):
            events.append(
                AnomalyEvent(
                    timestamp=str(row["timestamp"]),
                    score=round(sc, 4),
                    is_anomaly=bool(flag),
                    features={s: float(row[s]) for s in self.streams},
                    contributing=self._contributing(row) if flag else [],
                )
            )
        return events

    def anomalies(self, rows: list[dict]) -> list[AnomalyEvent]:
        """Convenience: only the rows flagged as anomalous."""
        return [e for e in self.detect(rows) if e.is_anomaly]

    def _contributing(self, row: dict) -> list[str]:
        """Streams whose standardised deviation is the largest contributors."""
        deviations = []
        for s in self.streams:
            z = abs(float(row[s]) - self._mean.get(s, 0.0)) / self._std.get(s, 1.0)
            if z >= _CONTRIB_Z:
                deviations.append((z, s))
        deviations.sort(reverse=True)
        return [s for _, s in deviations]


# ─── Audit logging ──────────────────────────────────────────────────────────


def append_anomaly_log(event: AnomalyEvent, log_path: str = LOG_PATH) -> None:
    """Append one anomaly as a JSON line to the audit log."""
    record = {"event": "anomaly_detected", **asdict(event)}
    with open(log_path, "a", encoding="utf8") as fh:
        fh.write(json.dumps(record) + "\n")


# ─── MongoDB runner (optional dependency) ───────────────────────────────────


def run_from_mongo(
    mongo_uri: str,
    lookback_minutes: int = 1440,
    contamination: float = 0.02,
    random_state: int | None = 7,
    log_path: str = LOG_PATH,
) -> list[AnomalyEvent]:
    """
    Pull recent sensor readings from MongoDB, detect anomalies, append each to
    the audit log, and return the flagged events.

    Requires ``pymongo``; raises a clear error if it is not installed.
    """
    try:
        from pymongo import MongoClient
    except ImportError as exc:  # pragma: no cover - exercised only without pymongo
        raise RuntimeError(
            "pymongo is required for run_from_mongo(); install it with "
            "`pip install -r analytics/requirements.txt`"
        ) from exc

    client = MongoClient(mongo_uri)
    db = client.get_default_database()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=lookback_minutes)

    raw = list(
        db.sensorreadings.find(
            {"timestamp": {"$gte": cutoff}},
            {"_id": 0, "stream": 1, "value": 1, "timestamp": 1},
        )
    )
    rows = align_readings(raw)
    if not rows:
        return []

    detector = SensorAnomalyDetector(
        contamination=contamination, random_state=random_state
    ).fit(rows)
    flagged = detector.anomalies(rows)
    for event in flagged:
        append_anomaly_log(event, log_path)
    return flagged


# ─── CLI ─────────────────────────────────────────────────────────────────────


def _demo_rows(n: int = 500) -> list[dict]:
    """Generate synthetic cruising-scenario rows with a few injected faults,
    so the CLI is runnable without a database for demos and smoke tests."""
    import random

    rng = random.Random(7)
    base = datetime(2026, 6, 1, tzinfo=timezone.utc)
    rows: list[dict] = []
    for i in range(n):
        ts = (base + timedelta(seconds=i)).strftime("%Y-%m-%dT%H:%M:%SZ")
        row = {
            "timestamp": ts,
            "fuel": 12.5 + 2.0 * math.sin(i / 60) + rng.gauss(0, 0.3),
            "generator": 8.2 + rng.gauss(0, 0.5),
            "water": 15.0 + rng.gauss(0, 0.8),
            "temperature": 21.0 + rng.gauss(0, 0.1),
        }
        # Inject a fault every ~150 samples: generator surge with normal fuel.
        if i % 150 == 149:
            row["generator"] = 30.0 + rng.gauss(0, 0.5)
        rows.append(row)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Suvion Systems sensor anomaly detection (Isolation Forest)"
    )
    parser.add_argument(
        "--mongo-uri",
        default=None,
        help="MongoDB URI; if omitted, runs against a synthetic demo dataset",
    )
    parser.add_argument(
        "--lookback-minutes",
        type=int,
        default=1440,
        help="How far back to pull readings from MongoDB (default: 24 h)",
    )
    parser.add_argument(
        "--contamination",
        type=float,
        default=0.02,
        help="Expected anomaly proportion, sets the decision threshold",
    )
    parser.add_argument("--random-state", type=int, default=7)
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON for API ingestion",
    )
    args = parser.parse_args()

    if args.mongo_uri:
        events = run_from_mongo(
            args.mongo_uri,
            lookback_minutes=args.lookback_minutes,
            contamination=args.contamination,
            random_state=args.random_state,
        )
        source = f"MongoDB ({args.lookback_minutes} min lookback)"
    else:
        rows = _demo_rows()
        detector = SensorAnomalyDetector(
            contamination=args.contamination, random_state=args.random_state
        ).fit(rows)
        events = detector.anomalies(rows)
        for event in events:
            append_anomaly_log(event)
        source = f"synthetic demo dataset ({len(rows)} rows)"

    if args.json:
        print(
            json.dumps(
                {
                    "source": source,
                    "events": [asdict(event) for event in events],
                }
            )
        )
    else:
        print(f"Anomaly detection over {source}")
        print(f"Flagged {len(events)} anomalous window(s):")
        for e in events:
            contrib = ", ".join(e.contributing) or "-"
            print(f"  {e.timestamp}  score={e.score:.3f}  contributing={contrib}")


if __name__ == "__main__":
    main()
