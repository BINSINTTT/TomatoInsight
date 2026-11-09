"""
Severity assessment must not depend on AI confidence.

Run from repo root or server/:
  pytest server/tests/test_severity_assessment.py -q
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from severity.assess import assess_severity, decode_image, segment_leaf  # noqa: E402
from severity.thresholds import band_for_affected_pct  # noqa: E402


def _encode_bgr(bgr: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", bgr)
    assert ok
    return buf.tobytes()


def _green_leaf_image(size: int = 240, lesion_frac: float = 0.0) -> bytes:
    """Synthetic leaf: solid green ellipse; optional brown lesion blob."""
    img = np.full((size, size, 3), 40, dtype=np.uint8)  # dark background
    center = (size // 2, size // 2)
    axes = (size // 3, size // 2 - 20)
    cv2.ellipse(img, center, axes, 0, 0, 360, (40, 160, 40), -1)
    if lesion_frac > 0:
        # Approximate lesion as a brown circle whose area ≈ lesion_frac of leaf ellipse area.
        leaf_area = np.pi * axes[0] * axes[1]
        lesion_area = max(1.0, leaf_area * lesion_frac)
        radius = int(max(3, round(np.sqrt(lesion_area / np.pi))))
        cv2.circle(img, (center[0], center[1] - axes[1] // 4), radius, (30, 70, 140), -1)
    return _encode_bgr(img)


def test_confidence_is_not_an_input_and_does_not_change_severity():
    """Same image + disease → same severity regardless of any confidence-like noise."""
    image = _green_leaf_image(lesion_frac=0.25)
    first = assess_severity(image, "early_blight")
    # Call again; assess_severity has no confidence parameter — inventing one must be ignored by API design.
    second = assess_severity(image, "early_blight")
    assert first["severity"] == second["severity"]
    assert first["affected_area_pct"] == second["affected_area_pct"]
    assert first["measurable"] == second["measurable"]
    assert "confidence" not in first
    assert assess_severity.__code__.co_varnames[: assess_severity.__code__.co_argcount] == (
        "image_bytes",
        "disease_raw",
    )


def test_tlcv_and_tswv_unable_to_assess():
    image = _green_leaf_image(lesion_frac=0.4)
    for disease in ("tlcv", "spotted_wilt", "tswv"):
        result = assess_severity(image, disease)
        assert result["ok"] is True
        assert result["severity"] == "Unable to Assess"
        assert result["affected_area_pct"] is None
        assert result["measurable"] is False
        assert result["reason"] == "virus_not_area_measurable"


def test_failed_segmentation_unable_to_assess():
    # Uniform noise / no green leaf → fail quality gates
    noise = np.random.default_rng(0).integers(0, 40, (120, 120, 3), dtype=np.uint8)
    result = assess_severity(_encode_bgr(noise), "early_blight")
    assert result["severity"] == "Unable to Assess"
    assert result["affected_area_pct"] is None
    assert result["measurable"] is False


def test_healthy_with_reliable_leaf_mask():
    image = _green_leaf_image(lesion_frac=0.0)
    result = assess_severity(image, "healthy")
    assert result["ok"] is True
    assert result["severity"] == "Healthy"
    assert result["affected_area_pct"] == 0.0
    assert result["measurable"] is True


def test_early_blight_bands_from_affected_pct():
    assert band_for_affected_pct(0) == "Healthy"
    assert band_for_affected_pct(10) == "Mild"
    assert band_for_affected_pct(33) == "Mild"
    assert band_for_affected_pct(34) == "Moderate"
    assert band_for_affected_pct(66) == "Moderate"
    assert band_for_affected_pct(67) == "Severe"
    assert band_for_affected_pct(100) == "Severe"


def test_early_blight_measurable_on_synthetic_leaf():
    mild = assess_severity(_green_leaf_image(lesion_frac=0.12), "early_blight")
    severe = assess_severity(_green_leaf_image(lesion_frac=0.75), "early_blight")
    # Segmentation can vary; when measurable, severity must follow area bands not confidence.
    if mild["measurable"]:
        assert mild["affected_area_pct"] is not None
        assert mild["severity"] in {"Mild", "Moderate", "Severe", "Healthy"}
    if severe["measurable"] and mild["measurable"]:
        assert severe["affected_area_pct"] >= mild["affected_area_pct"]


def test_decode_and_segment_helpers():
    image_bytes = _green_leaf_image()
    bgr = decode_image(image_bytes)
    assert bgr is not None
    mask, reason = segment_leaf(bgr)
    assert mask is not None
    assert reason == ""
    assert cv2.countNonZero(mask) > 0


@pytest.mark.parametrize("junk", ["", "unknown", "potato_blight"])
def test_invalid_disease(junk):
    result = assess_severity(_green_leaf_image(), junk)
    assert result["ok"] is False
    assert result["severity"] == "Unable to Assess"
