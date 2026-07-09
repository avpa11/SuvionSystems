"""
Unit tests for the Suvion Systems anomaly-detection module.

Uses the standard-library ``unittest`` runner (no pytest / scikit-learn
dependency) so the suite runs in the grading environment as-is::

    python -m unittest discover analytics
    # or
    python analytics/test_anomaly_detection.py
"""

import math
import random
import unittest
from datetime import datetime, timedelta, timezone

from anomaly_detection import (
    STREAMS,
    SensorAnomalyDetector,
    align_readings,
)
from isolation_forest import IsolationForest, average_path_length


def make_normal_rows(n: int = 400, seed: int = 1) -> list[dict]:
    """Synthetic cruising rows with small Gaussian noise — all 'normal'."""
    rng = random.Random(seed)
    base = datetime(2026, 6, 1, tzinfo=timezone.utc)
    rows = []
    for i in range(n):
        ts = (base + timedelta(seconds=i)).strftime("%Y-%m-%dT%H:%M:%SZ")
        rows.append(
            {
                "timestamp": ts,
                "fuel": 12.5 + 2.0 * math.sin(i / 60) + rng.gauss(0, 0.25),
                "generator": 8.2 + rng.gauss(0, 0.4),
                "water": 15.0 + rng.gauss(0, 0.7),
                "temperature": 21.0 + rng.gauss(0, 0.1),
            }
        )
    return rows


class TestAveragePathLength(unittest.TestCase):
    def test_small_n_edge_cases(self):
        self.assertEqual(average_path_length(0), 0.0)
        self.assertEqual(average_path_length(1), 0.0)
        self.assertEqual(average_path_length(2), 1.0)

    def test_monotonic_increasing(self):
        # c(n) grows with n (more points → longer expected isolation paths).
        values = [average_path_length(n) for n in (2, 10, 100, 1000)]
        self.assertEqual(values, sorted(values))


class TestIsolationForestCore(unittest.TestCase):
    def test_scores_are_bounded(self):
        rng = random.Random(0)
        data = [[rng.gauss(0, 1), rng.gauss(0, 1)] for _ in range(200)]
        forest = IsolationForest(n_estimators=50, random_state=3).fit(data)
        for s in forest.score_samples(data):
            self.assertGreaterEqual(s, 0.0)
            self.assertLessEqual(s, 1.0)

    def test_obvious_outlier_scores_higher_than_inliers(self):
        rng = random.Random(0)
        # Tight cluster around the origin plus one far-flung point.
        data = [[rng.gauss(0, 0.5), rng.gauss(0, 0.5)] for _ in range(200)]
        outlier = [50.0, 50.0]
        forest = IsolationForest(n_estimators=100, random_state=3).fit(data)

        inlier_scores = forest.score_samples(data)
        outlier_score = forest.score_samples([outlier])[0]

        self.assertGreater(outlier_score, max(inlier_scores))

    def test_reproducible_with_random_state(self):
        rng = random.Random(0)
        data = [[rng.gauss(0, 1), rng.gauss(0, 1)] for _ in range(150)]
        a = IsolationForest(n_estimators=40, random_state=42).fit(data).score_samples(data)
        b = IsolationForest(n_estimators=40, random_state=42).fit(data).score_samples(data)
        self.assertEqual(a, b)

    def test_fit_empty_raises(self):
        with self.assertRaises(ValueError):
            IsolationForest().fit([])

    def test_score_before_fit_raises(self):
        with self.assertRaises(RuntimeError):
            IsolationForest().score_samples([[1.0, 2.0]])

    def test_invalid_contamination_raises(self):
        with self.assertRaises(ValueError):
            IsolationForest(contamination=0.9).fit([[1.0], [2.0], [3.0]])


class TestAlignReadings(unittest.TestCase):
    def test_groups_streams_into_complete_rows(self):
        base = datetime(2026, 6, 1, tzinfo=timezone.utc)
        flat = []
        for i in range(3):
            ts = base + timedelta(seconds=i)
            for stream, value in [
                ("fuel", 12.0),
                ("generator", 8.0),
                ("water", 15.0),
                ("temperature", 21.0),
            ]:
                flat.append({"stream": stream, "value": value, "timestamp": ts})

        rows = align_readings(flat)
        self.assertEqual(len(rows), 3)
        for row in rows:
            for stream in STREAMS:
                self.assertIn(stream, row)

    def test_drops_incomplete_buckets(self):
        base = datetime(2026, 6, 1, tzinfo=timezone.utc)
        # Only three of four streams present → bucket dropped.
        flat = [
            {"stream": "fuel", "value": 12.0, "timestamp": base},
            {"stream": "generator", "value": 8.0, "timestamp": base},
            {"stream": "water", "value": 15.0, "timestamp": base},
        ]
        self.assertEqual(align_readings(flat), [])

    def test_accepts_iso_string_timestamps(self):
        flat = []
        for stream, value in [
            ("fuel", 12.0),
            ("generator", 8.0),
            ("water", 15.0),
            ("temperature", 21.0),
        ]:
            flat.append(
                {"stream": stream, "value": value, "timestamp": "2026-06-01T00:00:00Z"}
            )
        rows = align_readings(flat)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["timestamp"], "2026-06-01T00:00:00Z")


class TestSensorAnomalyDetector(unittest.TestCase):
    def test_flags_injected_generator_surge(self):
        rows = make_normal_rows()
        # Inject a multivariate fault: generator surges while fuel stays normal.
        fault_idx = 200
        rows[fault_idx]["generator"] = 35.0

        detector = SensorAnomalyDetector(contamination=0.02, random_state=7).fit(rows)
        flagged = detector.anomalies(rows)
        flagged_times = {e.timestamp for e in flagged}

        self.assertIn(rows[fault_idx]["timestamp"], flagged_times)
        # The contributing stream should identify the generator.
        fault_event = next(e for e in flagged if e.timestamp == rows[fault_idx]["timestamp"])
        self.assertIn("generator", fault_event.contributing)

    def test_clean_data_flags_few_anomalies(self):
        rows = make_normal_rows(seed=5)
        detector = SensorAnomalyDetector(contamination=0.02, random_state=7).fit(rows)
        flagged = detector.anomalies(rows)
        # With 2% contamination on clean data, the flagged fraction stays small.
        self.assertLessEqual(len(flagged), math.ceil(0.05 * len(rows)))

    def test_detect_returns_one_event_per_row(self):
        rows = make_normal_rows(n=120)
        detector = SensorAnomalyDetector(random_state=7).fit(rows)
        events = detector.detect(rows)
        self.assertEqual(len(events), len(rows))
        for e in events:
            self.assertEqual(set(e.features), set(STREAMS))
            self.assertGreaterEqual(e.score, 0.0)
            self.assertLessEqual(e.score, 1.0)

    def test_fit_empty_raises(self):
        with self.assertRaises(ValueError):
            SensorAnomalyDetector().fit([])

    def test_constant_stream_does_not_divide_by_zero(self):
        # A perfectly constant stream has std 0; the scaler must not blow up.
        rows = make_normal_rows(n=100)
        for r in rows:
            r["water"] = 10.0
        detector = SensorAnomalyDetector(random_state=7).fit(rows)
        scores = detector.score(rows)
        self.assertTrue(all(math.isfinite(s) for s in scores))


if __name__ == "__main__":
    unittest.main(verbosity=2)
