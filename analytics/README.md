# Suvion Systems — Analytics (Anomaly Detection)

Multivariate anomaly detection over the four persisted sensor streams
(`fuel`, `generator`, `water`, `temperature`) using an **Isolation Forest**.

Faults often appear as an unusual *combination* of readings rather than any
single value leaving its range (e.g. generator current surging while fuel flow
stays normal). A forest over the joint feature vector catches those cases that
per-stream thresholds miss — it complements, rather than replaces, the API's
hourly non-compliant-period flagging.

## Why no scikit-learn

The Isolation Forest is implemented from scratch in
[`isolation_forest.py`](isolation_forest.py) using only the Python standard
library, matching the dependency-free convention of [`../simulation/`](../simulation).
The public surface (`fit` / `predict` / `score_samples`, `contamination`,
`random_state`) mirrors `sklearn.ensemble.IsolationForest`, so swapping in
scikit-learn later is a one-line change.

## Files

| File | Purpose |
|------|---------|
| `isolation_forest.py` | Dependency-free Isolation Forest (Liu, Ting & Zhou 2008) |
| `anomaly_detection.py` | Sensor-domain wrapper: feature alignment, scaling, events, MongoDB runner, CLI |
| `test_anomaly_detection.py` | `unittest` suite (16 tests) |
| `requirements.txt` | Optional `pymongo` for the live-database runner |

## Usage

Run the test suite (no dependencies required):

```bash
python -m unittest discover analytics
```

Run a synthetic demo (no database required) — generates cruising-scenario data
with injected generator-surge faults and flags them:

```bash
python analytics/anomaly_detection.py
```

Run against a live MongoDB (requires `pip install -r analytics/requirements.txt`):

```bash
python analytics/anomaly_detection.py \
    --mongo-uri mongodb://localhost:27017/suvion \
    --lookback-minutes 1440 \
    --contamination 0.02
```

As a library:

```python
from anomaly_detection import SensorAnomalyDetector

detector = SensorAnomalyDetector(contamination=0.02, random_state=7).fit(rows)
for event in detector.anomalies(rows):
    print(event.timestamp, event.score, event.contributing)
```

## Output

Each flagged window is appended as one JSON line to `anomaly-events.log`
(gitignored, same audit-log convention as `reporting-api.log` and
`data-lifecycle.log`):

```json
{"event": "anomaly_detected", "timestamp": "2026-06-01T00:02:29Z",
 "score": 0.686, "is_anomaly": true,
 "features": {"fuel": 12.7, "generator": 29.9, "water": 15.1, "temperature": 21.0},
 "contributing": ["generator"]}
```

`score` is in `[0, 1]`; values approaching 1.0 isolate quickly and are strong
anomalies. `contributing` lists the streams whose standardised deviation
(≥ 2σ from the training mean) most explains the flag.
