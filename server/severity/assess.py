"""
Symptom severity assessment (no image processing / OpenCV).

Disease *identity* stays with YOLO classification. Severity is not derived from
AI confidence. Without a validated image-measurement pipeline in this build,
non-healthy classes return "Unable to Assess".
"""

from __future__ import annotations

from typing import Any

from . import thresholds as thr

UNABLE = "Unable to Assess"
VALID_DISEASES = frozenset({"healthy", "early_blight", "tlcv", "spotted_wilt"})


def _normalize_disease(raw: str | None) -> str:
    key = str(raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "yellowleafcurlvirus": "tlcv",
        "yellow_leaf_curl": "tlcv",
        "yellow_leaf_curl_virus": "tlcv",
        "tylcv": "tlcv",
        "earlyblight": "early_blight",
        "early_blight_virus": "early_blight",
        "spottedwilt": "spotted_wilt",
        "spotted_wilt_virus": "spotted_wilt",
        "tswv": "spotted_wilt",
    }
    key = aliases.get(key, key)
    return key if key in VALID_DISEASES else ""


def _result(
    *,
    disease: str,
    severity: str,
    affected_area_pct: float | None,
    measurable: bool,
    reason: str,
) -> dict[str, Any]:
    return {
        "ok": True,
        "disease": disease,
        "severity": severity,
        "affected_area_pct": affected_area_pct,
        "measurable": measurable,
        "reason": reason,
        "thresholds": thr.thresholds_echo(),
    }


def assess_severity(image_bytes: bytes, disease_raw: str | None) -> dict[str, Any]:
    """
    Assess severity from classified disease key only.
    image_bytes is accepted for API compatibility but is not analyzed.
    Confidence must not be supplied or used.
    """
    disease = _normalize_disease(disease_raw)
    if not disease:
        return {
            "ok": False,
            "error": "invalid_disease",
            "message": "Send disease/bar_key: healthy, early_blight, tlcv, or spotted_wilt.",
            "severity": UNABLE,
            "affected_area_pct": None,
            "measurable": False,
            "reason": "invalid_disease",
            "thresholds": thr.thresholds_echo(),
        }

    if disease == "healthy":
        # Classified healthy: no disease extent to report (not an image measurement).
        return _result(
            disease=disease,
            severity="Healthy",
            affected_area_pct=0.0,
            measurable=True,
            reason="classified_healthy_no_disease_extent",
        )

    # Diseased classes: do not invent Mild/Moderate/Severe or area % without a
    # manuscript-compatible measurement method.
    return _result(
        disease=disease,
        severity=UNABLE,
        affected_area_pct=None,
        measurable=False,
        reason="severity_not_measured_without_image_pipeline",
    )
