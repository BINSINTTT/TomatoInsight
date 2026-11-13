"""Tests for Early Blight/Spotted Wilt specialist score refinement."""

from __future__ import annotations

import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from specialist.ultralytics_segmentation import refine_scores_from_segmentation


def polygon(name: str, confidence: float) -> dict:
    return {
        "name": name,
        "confidence": confidence,
        "segments": {"x": [0, 1, 1, 0], "y": [0, 0, 1, 1]},
    }


def payload(*results: dict, task: str = "segment") -> dict:
    return {"images": [{"results": list(results)}], "metadata": {"task": task}}


def test_specialist_corrects_early_blight_to_spotted_wilt():
    result = refine_scores_from_segmentation(
        payload(polygon("leaf", 0.9), polygon("spotted_wilt_symptom", 0.88)),
        {"healthy": 0, "tlcv": 0, "early_blight": 80, "spotted_wilt": 20},
    )
    assert result["applied"] is True
    assert result["final_disease"] == "spotted_wilt"
    assert result["scores"]["spotted_wilt"] > result["scores"]["early_blight"]


def test_specialist_is_skipped_for_tlcv():
    result = refine_scores_from_segmentation(
        payload(polygon("spotted_wilt_symptom", 0.99)),
        {"healthy": 2, "tlcv": 90, "early_blight": 5, "spotted_wilt": 3},
    )
    assert result["applied"] is False
    assert result["reason"] == "specialist_not_needed"
    assert result["final_disease"] == "tlcv"


def test_ambiguous_specialist_keeps_main_scores():
    scores = {"healthy": 0, "tlcv": 0, "early_blight": 55, "spotted_wilt": 45}
    result = refine_scores_from_segmentation(
        payload(
            polygon("early_blight_symptom", 0.8),
            polygon("spotted_wilt_symptom", 0.79),
        ),
        scores,
    )
    assert result["applied"] is False
    assert result["reason"] == "specialist_result_ambiguous"
    assert result["scores"] == scores


def test_detection_model_is_rejected():
    result = refine_scores_from_segmentation(
        payload(polygon("spotted_wilt_symptom", 0.99), task="detect"),
        {"healthy": 0, "tlcv": 0, "early_blight": 80, "spotted_wilt": 20},
    )
    assert result["applied"] is False
    assert result["reason"] == "invalid_specialist_model_task"
