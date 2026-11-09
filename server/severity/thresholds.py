"""
Configurable severity thresholds.

Bands are provisional defaults matching the existing app (Mild 1–33, Moderate 34–66,
Severe 67–100). Replace with expert-validated cutoffs when available — do not treat
these percentages as clinically validated ground truth.
"""

from __future__ import annotations

from typing import Any

# Symptom extent bands (% of estimated symptomatic leaf area within the leaf mask).
MILD_MAX = 33.0
MODERATE_MAX = 66.0
# Above MODERATE_MAX → Severe

# Leaf segmentation quality gates (fraction of image pixels / contour heuristics).
MIN_LEAF_AREA_FRACTION = 0.05
MAX_LEAF_AREA_FRACTION = 0.92
MIN_LEAF_SOLIDITY = 0.35
MIN_LEAF_CONTOUR_AREA = 500

# Early blight lesion heuristics inside the leaf mask (HSV).
# Brown/tan lesions and yellow discoloration — tunable, not disease-lab calibrated.
LESION_HSV_RANGES = (
    # Brown / dark necrotic spots
    ((0, 40, 20), (25, 255, 180)),
    ((160, 40, 20), (179, 255, 180)),
    # Yellow chlorosis / pale tissue
    ((15, 40, 80), (40, 255, 255)),
)

MIN_LESION_PIXELS = 40


def band_for_affected_pct(affected_pct: float) -> str:
    pct = float(affected_pct)
    if pct <= 0:
        return "Healthy"
    if pct <= MILD_MAX:
        return "Mild"
    if pct <= MODERATE_MAX:
        return "Moderate"
    return "Severe"


def thresholds_echo() -> dict[str, Any]:
    return {
        "mild_max": MILD_MAX,
        "moderate_max": MODERATE_MAX,
        "min_leaf_area_fraction": MIN_LEAF_AREA_FRACTION,
        "max_leaf_area_fraction": MAX_LEAF_AREA_FRACTION,
        "note": "Provisional configurable cutoffs; not expert-validated measurements.",
    }
