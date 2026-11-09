"""
Configurable severity band labels (kept for UI/API transparency).

Bands are provisional defaults. This build does not compute affected-area %;
diseased scans return Unable to Assess instead of inventing Mild/Moderate/Severe.
"""

from __future__ import annotations

from typing import Any

# Provisional cutoffs if a measurable % is supplied by a future pipeline.
MILD_MAX = 33.0
MODERATE_MAX = 66.0


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
        "note": "Provisional bands only; this build does not measure affected leaf area.",
    }
