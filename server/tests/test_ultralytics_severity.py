"""Tests for Ultralytics polygon-based disease severity."""

from __future__ import annotations

import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from severity.ultralytics_segmentation import (  # noqa: E402
    polygon_area,
    severity_from_segmentation,
    summarize_segmentation,
)


def _result(name: str, x: list[float], y: list[float], confidence: float = 0.9) -> dict:
    return {
        "name": name,
        "confidence": confidence,
        "segments": {"x": x, "y": y},
    }


def _payload(*results: dict) -> dict:
    return {
        "images": [{"shape": [100, 100], "results": list(results)}],
        "metadata": {
            "task": "segment",
            "classNames": {
                "0": "leaf",
                "1": "early_blight_symptom",
                "2": "tlcv_symptom",
                "3": "spotted_wilt_symptom",
            },
        },
    }


def test_polygon_area_uses_polygon_not_confidence():
    assert polygon_area([(0, 0), (10, 0), (10, 10), (0, 10)]) == 100


def test_early_blight_severity_is_symptom_over_leaf_area():
    payload = _payload(
        _result("leaf", [0, 1, 1, 0], [0, 0, 1, 1], confidence=0.51),
        _result(
            "early_blight_symptom",
            [0, 0.5, 0.5, 0],
            [0, 0, 0.5, 0.5],
            confidence=0.99,
        ),
    )
    result = severity_from_segmentation(payload, "early_blight")

    assert result["ok"] is True
    assert result["measurable"] is True
    assert result["severity_pct"] == 25.0
    assert result["severity"] == "Mild"
    assert result["severity_pct"] != 99.0
    assert result["source"] == "ultralytics_segmentation"


def test_healthy_is_zero_when_leaf_mask_exists():
    payload = _payload(_result("leaf", [0, 1, 1, 0], [0, 0, 1, 1]))
    result = severity_from_segmentation(payload, "healthy")

    assert result["measurable"] is True
    assert result["severity_pct"] == 0.0
    assert result["severity"] == "Healthy"


def test_missing_leaf_denominator_is_not_reported_as_100_percent():
    payload = _payload(
        _result("tlcv_symptom", [0, 0.5, 0.5, 0], [0, 0, 0.5, 0.5])
    )
    result = severity_from_segmentation(payload, "tlcv")

    assert result["ok"] is True
    assert result["measurable"] is False
    assert result["severity_pct"] is None
    assert result["severity"] == "Unable to Assess"
    assert result["reason"] == "leaf_mask_missing"
    assert result["rescan_recommended"] is True


def test_missing_selected_symptom_is_unable_not_healthy():
    payload = _payload(_result("leaf", [0, 1, 1, 0], [0, 0, 1, 1]))
    result = severity_from_segmentation(payload, "spotted_wilt")

    assert result["measurable"] is False
    assert result["severity_pct"] is None
    assert result["reason"] == "selected_symptom_mask_missing"


def test_detection_endpoint_is_rejected_before_area_calculation():
    payload = {
        "images": [
            {
                "results": [
                    {
                        "name": "leaf",
                        "class": 0,
                        "confidence": 0.9,
                        "box": {"x1": 0, "y1": 0, "x2": 1, "y2": 1},
                    }
                ]
            }
        ],
        "metadata": {"task": "detect"},
    }
    result = severity_from_segmentation(payload, "early_blight")

    assert result["ok"] is False
    assert result["reason"] == "invalid_severity_model_task"
    assert result["expected_task"] == "segment"
    assert result["actual_task"] == "detect"


def test_flat_segments_and_class_name_metadata_are_supported():
    payload = {
        "images": [
            {
                "results": [
                    {"class": 0, "segments": [0, 0, 10, 0, 10, 10, 0, 10]},
                    {"class": 3, "segments": [0, 0, 5, 0, 5, 10, 0, 10]},
                ]
            }
        ],
        "metadata": {
            "classNames": [
                "leaf",
                "early_blight_symptom",
                "tlcv_symptom",
                "spotted_wilt_symptom",
            ]
        },
    }
    summary = summarize_segmentation(payload)
    result = severity_from_segmentation(payload, "spotted_wilt")

    assert summary["counts"]["leaf"] == 1
    assert summary["counts"]["spotted_wilt"] == 1
    assert result["severity_pct"] == 50.0
    assert result["severity"] == "Moderate"
