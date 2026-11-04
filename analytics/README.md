# Anomaly detection

This module experiments with an Isolation Forest over the four persisted streams:
`fuel`, `generator`, `water`, and `temperature`. It can flag unusual combinations
of readings alongside the report's separate operational-target checks. It is not
a validated alarm system, regulatory check, or demonstrated detector for real
vessel faults.

The model and synthetic demo use only the Python standard library. `pymongo` is
needed only for the live database runner. The implementation has familiar method
names, but its score/prediction conventions are not interchangeable with
scikit-learn: higher scores are more anomalous, and `predict` returns 1 for an
anomaly and 0 otherwise.

## Files

| File                                                   | Purpose                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| [isolation_forest.py](isolation_forest.py)             | Standard-library Isolation Forest implementation               |
| [anomaly_detection.py](anomaly_detection.py)           | Alignment, scaling, event generation, database runner, and CLI |
| [test_anomaly_detection.py](test_anomaly_detection.py) | Behavioral tests                                               |
| [requirements.txt](requirements.txt)                   | Optional database connector                                    |

## Tests and synthetic demo

Run from the repository root with Python 3.10+:

```sh
python3 -m unittest discover analytics
python3 analytics/anomaly_detection.py --json
```

The demo generates synthetic rows with injected generator surges. It appends
flagged events to the ignored `analytics/anomaly-events.log`.

## Native database runner

Use an activated virtual environment so the API scheduler can find the same
Python dependencies:

```sh
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r analytics/requirements.txt
python3 analytics/anomaly_detection.py \
  --mongo-uri mongodb://127.0.0.1:27017/suvion \
  --lookback-minutes 1440 --contamination 0.02 --json
```

For the API scheduler, enable `ANOMALY_DETECTION_ENABLED=true` in the root `.env`
and start the API from that activated environment. The API Docker image already
includes Python and the connector. See [integration configuration](../docs/integrations.md).

The database runner aligns recent readings, fits on that window, and scores the
same window. This is exploratory analysis, not an independent train/test
validation. Overlapping scheduled windows can report the same event again.

## Library use

The current module imports its sibling directly, so use the `analytics` directory
as the working directory for this example. Supply your own aligned `rows`:

```python
from anomaly_detection import SensorAnomalyDetector

detector = SensorAnomalyDetector(contamination=0.02, random_state=7).fit(rows)
for event in detector.anomalies(rows):
    print(event.timestamp, event.score, event.contributing)
```

Events contain a timestamp, score, anomaly flag, feature values, and contributing
streams. Scores lie in `[0, 1]`; they are not calibrated fault probabilities.
`contributing` lists streams at least two standard deviations from the training
mean, not causal explanations. The log is descriptive and has no automatic rotation.
