"""
Suvion Systems — Isolation Forest
=================================
A dependency-free implementation of the Isolation Forest anomaly-detection
algorithm (Liu, Ting & Zhou, 2008), used by the sensor anomaly detector.

The repository's Python tooling is intentionally standard-library only (see
``simulation/``), and the lab/grading environment has no scientific-Python
stack available, so this module re-implements the algorithm rather than
depending on scikit-learn. The public surface mirrors scikit-learn's
``IsolationForest`` closely enough (``fit`` / ``predict`` / ``score_samples``,
``contamination``, ``random_state``) that swapping in sklearn later is trivial.

Algorithm summary
-----------------
* Build ``n_estimators`` isolation trees, each on a random sub-sample of size
  ``max_samples``.
* Each tree recursively splits on a random feature at a random value between
  that feature's observed min and max, until a point is isolated or the
  height limit ``ceil(log2(max_samples))`` is reached.
* A point's anomaly score derives from its average path length across the
  forest: points that isolate quickly (short paths) are anomalous.
  ``score = 2 ** (-avg_path / c(n))`` where ``c(n)`` is the expected path
  length of an unsuccessful BST search over ``n`` points.
* Scores near 1.0 are strong anomalies; scores well below 0.5 are normal.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

# Euler–Mascheroni constant, used in the harmonic-number approximation.
_EULER_GAMMA = 0.5772156649015329

Vector = list[float]
Matrix = list[Vector]


def _harmonic(i: float) -> float:
    """Approximate the i-th harmonic number H(i) = ln(i) + gamma."""
    return math.log(i) + _EULER_GAMMA


def average_path_length(n: int) -> float:
    """
    c(n): expected path length of an unsuccessful search in a binary search
    tree over n points. Used to normalise observed path lengths into scores.
    """
    if n <= 1:
        return 0.0
    if n == 2:
        return 1.0
    return 2.0 * _harmonic(n - 1) - (2.0 * (n - 1) / n)


@dataclass
class _Node:
    """One node of an isolation tree.

    Internal nodes carry a split (feature index + value) and two children.
    External (leaf) nodes carry the number of points that reached them, which
    feeds the c(size) path-length correction for early-terminated branches.
    """

    # Internal node fields
    feature: int | None = None
    split_value: float | None = None
    left: "_Node | None" = None
    right: "_Node | None" = None
    # External node field
    size: int = 0

    @property
    def is_leaf(self) -> bool:
        return self.left is None and self.right is None


class _IsolationTree:
    """A single isolation tree grown on a sub-sample of the data."""

    def __init__(self, height_limit: int, rng: random.Random) -> None:
        self._height_limit = height_limit
        self._rng = rng
        self.root: _Node | None = None

    def fit(self, data: Matrix) -> "_IsolationTree":
        self.root = self._grow(data, current_height=0)
        return self

    def _grow(self, data: Matrix, current_height: int) -> _Node:
        n = len(data)
        if current_height >= self._height_limit or n <= 1:
            return _Node(size=n)

        n_features = len(data[0])
        # Pick a feature whose values are not all identical, so the split
        # actually partitions the points. If every feature is constant the
        # points are duplicates and we stop here.
        candidate_features = list(range(n_features))
        self._rng.shuffle(candidate_features)
        for feature in candidate_features:
            col = [row[feature] for row in data]
            lo, hi = min(col), max(col)
            if lo == hi:
                continue

            split_value = self._rng.uniform(lo, hi)
            left = [row for row in data if row[feature] < split_value]
            right = [row for row in data if row[feature] >= split_value]
            # A uniform split between distinct min/max always separates points,
            # but guard against degenerate float edge cases.
            if not left or not right:
                continue

            return _Node(
                feature=feature,
                split_value=split_value,
                left=self._grow(left, current_height + 1),
                right=self._grow(right, current_height + 1),
            )

        return _Node(size=n)

    def path_length(self, point: Vector) -> float:
        """Path length of a point: edges traversed plus the c(size) correction
        for the subtree that was not fully grown at the terminating leaf."""
        node = self.root
        assert node is not None, "tree must be fitted before scoring"
        length = 0.0
        while not node.is_leaf:
            assert node.feature is not None and node.split_value is not None
            if point[node.feature] < node.split_value:
                node = node.left  # type: ignore[assignment]
            else:
                node = node.right  # type: ignore[assignment]
            length += 1.0
        return length + average_path_length(node.size)


class IsolationForest:
    """
    Ensemble of isolation trees.

    Parameters
    ----------
    n_estimators : number of trees in the forest.
    max_samples : sub-sample size used to grow each tree (capped at the
        dataset size). The classic default of 256 balances accuracy and cost.
    contamination : expected proportion of anomalies, used to set the decision
        threshold for ``predict``. If ``None`` the threshold defaults to a
        score of 0.5 (the algorithm's natural break-even point).
    random_state : seed for reproducible forests.
    """

    def __init__(
        self,
        n_estimators: int = 100,
        max_samples: int = 256,
        contamination: float | None = "auto",  # type: ignore[assignment]
        random_state: int | None = None,
    ) -> None:
        self.n_estimators = n_estimators
        self.max_samples = max_samples
        self.contamination = contamination
        self.random_state = random_state
        self._trees: list[_IsolationTree] = []
        self._c_norm: float = 1.0
        self.threshold_: float = 0.5

    def fit(self, data: Matrix) -> "IsolationForest":
        if not data:
            raise ValueError("cannot fit IsolationForest on empty data")

        rng = random.Random(self.random_state)
        n = len(data)
        sample_size = min(self.max_samples, n)
        height_limit = max(1, math.ceil(math.log2(sample_size)))
        self._c_norm = average_path_length(sample_size) or 1.0

        self._trees = []
        for _ in range(self.n_estimators):
            sub = rng.sample(data, sample_size) if n > sample_size else list(data)
            self._trees.append(_IsolationTree(height_limit, rng).fit(sub))

        # Set the anomaly-score threshold from the contamination level by
        # taking the (1 - contamination) quantile of the training scores.
        contamination = self.contamination
        if contamination in (None, "auto"):
            self.threshold_ = 0.5
        else:
            c = float(contamination)  # type: ignore[arg-type]
            if not 0.0 < c < 0.5:
                raise ValueError("contamination must be in (0, 0.5)")
            scores = sorted(self.score_samples(data), reverse=True)
            idx = min(len(scores) - 1, int(math.ceil(c * len(scores))) - 1)
            self.threshold_ = scores[max(idx, 0)]
        return self

    def score_samples(self, data: Matrix) -> list[float]:
        """Anomaly score in [0, 1] for each point; higher = more anomalous."""
        if not self._trees:
            raise RuntimeError("IsolationForest must be fitted before scoring")
        scores = []
        for point in data:
            avg_path = sum(t.path_length(point) for t in self._trees) / len(self._trees)
            scores.append(2.0 ** (-avg_path / self._c_norm))
        return scores

    def predict(self, data: Matrix) -> list[int]:
        """Return 1 for anomalies and 0 for normal points, using ``threshold_``."""
        return [1 if s >= self.threshold_ else 0 for s in self.score_samples(data)]
