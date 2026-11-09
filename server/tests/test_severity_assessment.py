"""
Severity assessment must not depend on AI confidence or OpenCV.

Run:
  pytest server/tests/test_severity_assessment.py -q
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from severity.assess import assess_severity  # noqa: E402
from severity.thresholds import band_for_affected_pct  # noqa: E402


def test_confidence_is_not_an_input_and_does_not_change_severity():
    first = assess_severity(b"ignored-image", "early_blight")
    second = assess_severity(b"different-bytes-also-ignored", "early_blight")
    assert first["severity"] == second["severity"] == "Unable to Assess"
    assert first["affected_area_pct"] is None
    assert second["affected_area_pct"] is None
    assert "confidence" not in first
    assert assess_severity.__code__.co_varnames[: assess_severity.__code__.co_argcount] == (
        "image_bytes",
        "disease_raw",
    )


def test_diseases_unable_to_assess():
    for disease in ("early_blight", "tlcv", "spotted_wilt", "tswv"):
        result = assess_severity(b"x", disease)
        assert result["ok"] is True
        assert result["severity"] == "Unable to Assess"
        assert result["affected_area_pct"] is None
        assert result["measurable"] is False


def test_healthy_without_inventing_area_pipeline():
    result = assess_severity(b"x", "healthy")
    assert result["ok"] is True
    assert result["severity"] == "Healthy"
    assert result["affected_area_pct"] == 0.0
    assert result["measurable"] is True


def test_band_helper_still_available():
    assert band_for_affected_pct(0) == "Healthy"
    assert band_for_affected_pct(10) == "Mild"
    assert band_for_affected_pct(50) == "Moderate"
    assert band_for_affected_pct(80) == "Severe"


@pytest.mark.parametrize("junk", ["", "unknown", "potato_blight"])
def test_invalid_disease(junk):
    result = assess_severity(b"x", junk)
    assert result["ok"] is False
    assert result["severity"] == "Unable to Assess"
